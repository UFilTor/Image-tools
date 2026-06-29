"use client";

import { useState, useCallback, useRef } from "react";
import { UpscaleItem, UpscaleFactor } from "@/lib/types";
import { readFileAsImage } from "@/lib/image-utils";
import { isAcceptedFile } from "@/lib/constants";
import { upscaleImage, measureDataUrl } from "@/lib/upscale";

type UpscaleStep = "upload" | "processing";

export function useUpscale() {
  const [step, setStep] = useState<UpscaleStep>("upload");
  const [items, setItems] = useState<UpscaleItem[]>([]);
  const [scale, setScale] = useState<UpscaleFactor>(2);
  const [modelLoading, setModelLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const runGen = useRef(0);

  // Process the queue one image at a time. tfjs runs on a single GPU context, so
  // concurrent upscales would contend and can OOM — serialize the compute.
  const runBatch = useCallback(async (queue: UpscaleItem[], factor: UpscaleFactor) => {
    const myGen = ++runGen.current;
    setModelLoading(true);
    for (let idx = 0; idx < queue.length; idx++) {
      if (myGen !== runGen.current) return;
      setItems((prev) => {
        if (myGen !== runGen.current) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], status: "processing", progress: 0 };
        return next;
      });
      try {
        const result = await upscaleImage(queue[idx].src, factor, (pct) => {
          if (myGen !== runGen.current) return;
          setItems((prev) => {
            if (myGen !== runGen.current) return prev;
            const next = [...prev];
            if (next[idx]?.status === "processing") next[idx] = { ...next[idx], progress: pct };
            return next;
          });
        });
        if (myGen !== runGen.current) return;
        setModelLoading(false);
        const resultNatural = await measureDataUrl(result);
        if (myGen !== runGen.current) return;
        setItems((prev) => {
          if (myGen !== runGen.current) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], status: "done", progress: 100, result, resultNatural };
          return next;
        });
      } catch (err) {
        if (myGen !== runGen.current) return;
        setModelLoading(false);
        setItems((prev) => {
          if (myGen !== runGen.current) return prev;
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            status: "error",
            error: err instanceof Error ? err.message : "Upscaling failed",
          };
          return next;
        });
      }
    }
    if (myGen === runGen.current) setModelLoading(false);
  }, []);

  const loadAndUpscale = useCallback(async (files: FileList) => {
    setLoadError(null);
    const arr = Array.from(files).filter((f) => isAcceptedFile(f));
    if (!arr.length) return;

    const results = await Promise.all(arr.map(readFileAsImage));
    const ok: UpscaleItem[] = [];
    arr.forEach((f, i) => {
      const r = results[i];
      if (r) {
        ok.push({
          src: r.src, name: r.name, natural: r.nat,
          status: "queued", progress: 0, result: null, resultNatural: null,
        });
      }
    });
    const failed = arr.length - ok.length;
    if (!ok.length) {
      setLoadError(`Couldn't read ${arr.length === 1 ? "that image" : "any of those images"}. Try a different file.`);
      return;
    }
    if (failed > 0) setLoadError(`Skipped ${failed} unreadable file${failed === 1 ? "" : "s"}.`);

    setItems(ok);
    setStep("processing");
    runBatch(ok, scale);
  }, [scale, runBatch]);

  // Re-run the whole queue at a new scale (resets results).
  const changeScale = useCallback((factor: UpscaleFactor) => {
    setScale(factor);
    if (factor === scale || !items.length) return;
    const reset = items.map((it) => ({
      ...it, status: "queued" as const, progress: 0, result: null, resultNatural: null, error: undefined,
    }));
    setItems(reset);
    runBatch(reset, factor);
  }, [scale, items, runBatch]);

  const retryItem = useCallback((idx: number) => {
    const current = items[idx];
    if (!current || current.status === "processing") return;
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "processing", progress: 0, result: null, resultNatural: null, error: undefined };
      return next;
    });
    const myGen = runGen.current;
    (async () => {
      try {
        const result = await upscaleImage(current.src, scale, (pct) => {
          if (myGen !== runGen.current) return;
          setItems((prev) => {
            const next = [...prev];
            if (next[idx]?.status === "processing") next[idx] = { ...next[idx], progress: pct };
            return next;
          });
        });
        const resultNatural = await measureDataUrl(result);
        setItems((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], status: "done", progress: 100, result, resultNatural };
          return next;
        });
      } catch (err) {
        setItems((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], status: "error", error: err instanceof Error ? err.message : "Upscaling failed" };
          return next;
        });
      }
    })();
  }, [items, scale]);

  const reset = useCallback(() => {
    runGen.current++;
    setItems([]);
    setStep("upload");
    setModelLoading(false);
    setLoadError(null);
  }, []);

  const doneCount = items.filter((it) => it.status === "done").length;
  const processingCount = items.filter((it) => it.status === "processing" || it.status === "queued").length;

  return {
    step, items, scale, modelLoading, loadError,
    doneCount, processingCount,
    loadAndUpscale, changeScale, retryItem, reset,
    clearLoadError: () => setLoadError(null),
  };
}
