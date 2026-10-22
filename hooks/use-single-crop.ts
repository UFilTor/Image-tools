"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { CropRect, CropQueueItem } from "@/lib/types";
import { editorDispSize, rescaleCrop, revokeSrc, LoadedImage } from "@/lib/image-utils";
import { loadImageFiles } from "@/lib/load-images";
import { centered } from "@/lib/crop-math";
import { assignRoles, splitSet, type SetPreset } from "@/lib/storefront";
import { useWindowResize } from "./use-window-resize";

type CropStep = "upload" | "ratio" | "crop";

/** A photo re-cropped, centered, at its Full experience shape. */
const recropCentered = (it: CropQueueItem & { preset: SetPreset }) => ({
  ...it,
  crop: centered(it.disp.dw, it.disp.dh, it.preset.value),
  adjusted: false,
});

export function useSingleCrop() {
  const [step, setStep] = useState<CropStep>("upload");
  const [queue, setQueue] = useState<CropQueueItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [pendingImages, setPendingImages] = useState<LoadedImage[]>([]);
  const [ratio, setRatio] = useState<number | null>(1);
  const [ratioLabel, setRatioLabel] = useState("1:1");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Full experience: says when more photos were dropped than the page shows */
  const [setNote, setSetNote] = useState<string | null>(null);

  const current = queue[currentIdx] || null;
  // Full experience gives each photo its own shape; otherwise the batch shares `ratio`.
  const isSet = queue.some((q) => q.preset);

  // Object URLs must be released when images are discarded or the page unmounts.
  const srcsRef = useRef<string[]>([]);
  useEffect(() => {
    srcsRef.current = [...queue.map((q) => q.src), ...pendingImages.map((p) => p.src)];
  }, [queue, pendingImages]);

  const load = useCallback(async (files: FileList): Promise<LoadedImage[] | null> => {
    setLoadError(null);
    const { images, error } = await loadImageFiles(files);
    if (error) setLoadError(error);
    return images.length ? images : null;
  }, []);

  const buildQueue = (imgs: LoadedImage[], ratioVal: number | null): CropQueueItem[] =>
    imgs.map((img) => {
      const d = editorDispSize(img.nat);
      return { src: img.src, name: img.name, natural: img.nat, disp: d, crop: centered(d.dw, d.dh, ratioVal), adjusted: false };
    });

  const enterCrop = (items: CropQueueItem[], ratioVal: number | null, rLabel: string) => {
    setSetNote(null);
    setQueue(items);
    setCurrentIdx(0);
    setRatio(ratioVal);
    setRatioLabel(rLabel);
    setStep("crop");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const loadImage = useCallback(async (files: FileList) => {
    const ok = await load(files);
    if (!ok) return;
    setPendingImages(ok);
    setStep("ratio");
  }, [load]);

  const loadWithRatio = useCallback(async (files: FileList, ratioVal: number | null, rLabel: string) => {
    const ok = await load(files);
    if (!ok) return;
    enterCrop(buildQueue(ok, ratioVal), ratioVal, rLabel);
  }, [load]);

  const pickRatio = useCallback((v: number | null, label: string) => {
    enterCrop(buildQueue(pendingImages, v), v, label);
  }, [pendingImages]);

  /**
   * Full experience: the first photo is the main one, the rest secondary photos at the shape for
   * their count. Only EXPERIENCE_SET_MAX fit the page's gallery; the rest are released, with a note.
   */
  const enterSet = useCallback((imgs: LoadedImage[]) => {
    const { kept, dropped, note } = splitSet(imgs);
    dropped.forEach((img) => revokeSrc(img.src));
    const items = assignRoles(buildQueue(kept, null), recropCentered);
    if (!items.length) return;
    enterCrop(items, items[0].preset.value, items[0].preset.label);
    setSetNote(note);
  }, []);

  const loadExperienceSet = useCallback(async (files: FileList) => {
    const ok = await load(files);
    if (ok) enterSet(ok);
  }, [load, enterSet]);

  /** The ratio picker's Full experience card: the loaded images, in the order they came in. */
  const pickSet = useCallback(() => {
    if (pendingImages.length) enterSet(pendingImages);
  }, [pendingImages, enterSet]);

  /** Full experience: make the current photo the main one. Photos whose shape changes are re-cropped, centered. */
  const makeMain = useCallback(() => {
    setQueue((prev) => {
      if (currentIdx <= 0 || currentIdx >= prev.length) return prev;
      return assignRoles([prev[currentIdx], ...prev.filter((_, i) => i !== currentIdx)], recropCentered);
    });
    setCurrentIdx(0);
  }, [currentIdx]);

  /** Switch the ratio inside the editor (Secondary photo's 1 / 2 / 3 switch): every image is re-cropped, centered. */
  const changeRatio = useCallback((v: number | null, label: string) => {
    setQueue((prev) => prev.map((it) => ({ ...it, crop: centered(it.disp.dw, it.disp.dh, v), adjusted: false, preset: undefined })));
    setRatio(v);
    setRatioLabel(label);
  }, []);

  const setCrop = useCallback((crop: CropRect) => {
    setQueue((prev) => {
      const next = [...prev];
      if (next[currentIdx]) {
        next[currentIdx] = { ...next[currentIdx], crop, adjusted: true };
      }
      return next;
    });
  }, [currentIdx]);

  // Keep the editor sized to the viewport; crops are display-space so they scale along.
  useWindowResize(() => {
    setQueue((prev) => prev.map((it) => {
      const d = editorDispSize(it.natural);
      if (d.dw === it.disp.dw && d.dh === it.disp.dh) return it;
      return { ...it, disp: d, crop: rescaleCrop(it.crop, it.disp, d) };
    }));
  });

  const navigateTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= queue.length) return;
    setCurrentIdx(idx);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [queue.length]);

  const goToRatio = useCallback(() => {
    setPendingImages(queue.map((q) => ({ src: q.src, name: q.name, mime: "", nat: q.natural })));
    setStep("ratio");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [queue]);

  const reset = useCallback(() => {
    srcsRef.current.forEach(revokeSrc);
    setSetNote(null);
    setQueue([]);
    setPendingImages([]);
    setCurrentIdx(0);
    setStep("upload");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const cropPx = current ? Math.round((current.crop.w * current.natural.w) / (current.disp.dw || 1)) : 0;
  const cropPy = current ? Math.round((current.crop.h * current.natural.h) / (current.disp.dh || 1)) : 0;
  const isMulti = queue.length > 1;

  return {
    step, queue, currentIdx, current,
    ratio: current?.preset ? current.preset.value : ratio,
    ratioLabel: current?.preset ? current.preset.label : ratioLabel,
    isSet, setNote, loadExperienceSet, pickSet, makeMain,
    crop: current?.crop ?? { x: 0, y: 0, w: 0, h: 0 },
    setCrop,
    src: current?.src ?? null,
    name: current?.name ?? "",
    nat: current?.natural ?? { w: 0, h: 0 },
    disp: current?.disp ?? { dw: 0, dh: 0 },
    zoom, setZoom, pan, setPan,
    cropPx, cropPy, isMulti,
    loadError, clearLoadError: () => setLoadError(null), reportLoadError: setLoadError,
    loadImage, loadWithRatio, pickRatio, changeRatio, navigateTo, goToRatio, reset,
  };
}
