"use client";

import { useState, useCallback, useRef } from "react";
import { UpscaleItem, UpscaleFactor } from "@/lib/types";
import { revokeSrc } from "@/lib/image-utils";
import { loadImageFiles } from "@/lib/load-images";
import { sizeChangePlan, upscaleImage, measureDataUrl, modeSizeError, pickMode, disposeUpscaler, ProcessMode } from "@/lib/upscale";

type UpscaleStep = "upload" | "processing";

/** Release the worker and model weights after this long without work. */
const IDLE_DISPOSE_MS = 3 * 60_000;

interface Job {
  idx: number;
  item: UpscaleItem;
  factor: UpscaleFactor;
  gen: number;
}

/** Release object URLs held by results so discarded blobs can be GC'd. */
function revokeResults(items: UpscaleItem[]) {
  for (const it of items) revokeSrc(it.result);
}

export function useUpscale() {
  const [step, setStep] = useState<UpscaleStep>("upload");
  const [items, setItems] = useState<UpscaleItem[]>([]);
  const [scale, setScale] = useState<UpscaleFactor>(2);
  const [modelLoading, setModelLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  // One queue for every run (batch, retry, mode change). tfjs runs on a single GPU
  // context, so concurrent upscales contend and can OOM; the pump serializes them.
  const runGen = useRef(0);
  const jobs = useRef<Job[]>([]);
  const pumping = useRef(false);

  // State lives for the whole session (see ToolStateProvider), so the worker and model
  // weights are released after the queue has been idle for a while rather than on unmount.
  const idleTimer = useRef<number | null>(null);
  const cancelIdleDispose = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = null;
  };
  const scheduleIdleDispose = () => {
    cancelIdleDispose();
    idleTimer.current = window.setTimeout(() => disposeUpscaler(), IDLE_DISPOSE_MS);
  };

  const patch = useCallback((idx: number, gen: number, update: Partial<UpscaleItem> | ((it: UpscaleItem) => Partial<UpscaleItem>)) => {
    setItems((prev) => {
      if (gen !== runGen.current || !prev[idx]) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...(typeof update === "function" ? update(next[idx]) : update) };
      return next;
    });
  }, []);

  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    cancelIdleDispose();
    setModelLoading(true);
    try {
      while (jobs.current.length) {
        const job = jobs.current.shift()!;
        const { idx, item, factor, gen } = job;
        if (gen !== runGen.current) continue;

        const sizeErr = modeSizeError(item.natural, item.mode, factor);
        if (sizeErr) {
          patch(idx, gen, { status: "error", progress: 0, error: sizeErr });
          continue;
        }
        patch(idx, gen, { status: "processing", progress: 0 });

        let result: string | null = null;
        try {
          result = await upscaleImage(item.src, factor, (pct) => {
            patch(idx, gen, (it) => (it.status === "processing" ? { progress: pct } : {}));
          }, item.mode);
          if (gen !== runGen.current) {
            // Cancelled mid-run (reset / scale change): free the blob we just made.
            revokeSrc(result);
            continue;
          }
          const resultNatural = await measureDataUrl(result);
          if (gen !== runGen.current) {
            revokeSrc(result);
            continue;
          }
          patch(idx, gen, { status: "done", progress: 100, result, resultNatural });
        } catch (err) {
          revokeSrc(result);
          patch(idx, gen, { status: "error", error: err instanceof Error ? err.message : "Upscaling failed" });
        }
      }
    } finally {
      pumping.current = false;
      setModelLoading(false);
      scheduleIdleDispose();
    }
  }, [patch]);

  const enqueue = useCallback((newJobs: Omit<Job, "gen">[]) => {
    const gen = runGen.current;
    jobs.current.push(...newJobs.map((j) => ({ ...j, gen })));
    void pump();
  }, [pump]);

  /**
   * `mode` and `factor` override the size-based default and the session scale: the storefront size
   * warning wants a 2x upscale, whatever scale was picked last (4x of a large crop can pass the cap).
   */
  const loadAndUpscale = useCallback(async (files: FileList, mode?: ProcessMode, factor?: UpscaleFactor) => {
    setLoadError(null);
    const { images, error } = await loadImageFiles(files);
    if (error) setLoadError(error);
    if (!images.length) return;
    const ok: UpscaleItem[] = images.map((r) => ({
      src: r.src, name: r.name, natural: r.nat,
      mode: mode ?? pickMode(r.nat),
      status: "queued", progress: 0, result: null, resultNatural: null,
    }));
    if (factor) setScale(factor);
    setItems(ok);
    setCurrentIdx(0);
    setStep("processing");
    enqueue(ok.map((item, idx) => ({ idx, item, factor: factor ?? scale })));
  }, [scale, enqueue]);

  // Re-run at a new scale. Enhance ignores the factor, so those results are kept as-is.
  // Switch the shared factor for `base` (the items as they should be) and re-queue what it affects.
  const rescale = useCallback((factor: UpscaleFactor, base: UpscaleItem[]) => {
    setScale(factor);
    runGen.current++;
    jobs.current = [];
    // Finished enhance results are kept (enhance ignores the factor); everything else,
    // including enhance items that were still queued or in flight, is re-queued.
    const reset = base.map((it) => {
      if (it.mode === "enhance" && it.status === "done") return it;
      revokeSrc(it.result);
      return { ...it, status: "queued" as const, progress: 0, result: null, resultNatural: null, error: undefined };
    });
    setItems(reset);
    enqueue(reset.flatMap((item, idx) => (item.status === "queued" ? [{ idx, item, factor }] : [])));
  }, [enqueue]);

  const changeScale = useCallback((factor: UpscaleFactor) => {
    setScale(factor);
    if (factor === scale || !items.length) return;
    rescale(factor, items);
  }, [scale, items, rescale]);

  // Queue one item (retry or per-image mode toggle); runs after whatever is in flight.
  const runSingle = useCallback((idx: number, item: UpscaleItem) => {
    revokeSrc(item.result);
    const queued = { ...item, status: "queued" as const, progress: 0, result: null, resultNatural: null, error: undefined };
    setItems((prev) => {
      const next = [...prev];
      next[idx] = queued;
      return next;
    });
    enqueue([{ idx, item: queued, factor: scale }]);
  }, [scale, enqueue]);

  const retryItem = useCallback((idx: number) => {
    const current = items[idx];
    if (!current || current.status === "processing" || current.status === "queued") return;
    runSingle(idx, current);
  }, [items, runSingle]);

  // Switch one image between upscale and enhance and re-run just that image.
  const changeMode = useCallback((idx: number, mode: ProcessMode) => {
    const current = items[idx];
    if (!current || current.status === "processing" || current.status === "queued" || current.mode === mode) return;
    runSingle(idx, { ...current, mode });
  }, [items, runSingle]);

  /**
   * One-click output size for one image: "same size" (enhance) or 2x / 4x (upscale). The factor
   * is shared by the batch, so a new factor goes through rescale with this image already set to
   * upscale. Calling changeScale + changeMode instead would queue this image with the old factor,
   * because both read state from the same render.
   */
  const changeSize = useCallback((idx: number, mode: ProcessMode, factor: UpscaleFactor) => {
    const current = items[idx];
    if (!current) return;
    const plan = sizeChangePlan(current, mode, factor, scale);
    if (plan === "rescale") rescale(factor, items.map((it, i) => (i === idx ? { ...it, mode: "upscale" as const } : it)));
    else if (plan === "mode") changeMode(idx, mode);
  }, [items, scale, rescale, changeMode]);

  const navigateTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= items.length) return;
    setCurrentIdx(idx);
  }, [items.length]);

  const reset = useCallback(() => {
    runGen.current++;
    jobs.current = [];
    revokeResults(items);
    items.forEach((it) => revokeSrc(it.src));
    setItems([]);
    setCurrentIdx(0);
    setStep("upload");
    setLoadError(null);
  }, [items]);

  const doneCount = items.filter((it) => it.status === "done").length;
  const processingCount = items.filter((it) => it.status === "processing" || it.status === "queued").length;

  return {
    step, items, scale, modelLoading, loadError,
    doneCount, processingCount, currentIdx, navigateTo,
    loadAndUpscale, changeScale, changeMode, changeSize, retryItem, reset,
    clearLoadError: () => setLoadError(null), reportLoadError: setLoadError,
  };
}
