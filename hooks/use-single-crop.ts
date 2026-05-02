"use client";

import { useState, useCallback } from "react";
import { CropRect, NaturalSize, DisplaySize, CropQueueItem } from "@/lib/types";
import { dispSize, readFileAsImage } from "@/lib/image-utils";
import { centered } from "@/lib/crop-math";
import { isAcceptedFile } from "@/lib/constants";

type CropStep = "upload" | "ratio" | "crop";

interface LoadedImage {
  src: string;
  name: string;
  nat: NaturalSize;
}

function computeDisp(nat: NaturalSize): DisplaySize {
  return dispSize(
    nat.w,
    nat.h,
    Math.min(typeof window !== "undefined" ? window.innerWidth - 96 : 800, nat.w),
    Math.min(typeof window !== "undefined" ? window.innerHeight - 230 : 600, nat.h),
  );
}

export function useSingleCrop() {
  const [step, setStep] = useState<CropStep>("upload");
  const [queue, setQueue] = useState<CropQueueItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [pendingImages, setPendingImages] = useState<LoadedImage[]>([]);
  const [ratio, setRatio] = useState<number | null>(1);
  const [ratioLabel, setRatioLabel] = useState("1:1");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const current = queue[currentIdx] || null;

  const [loadError, setLoadError] = useState<string | null>(null);

  const loadImage = useCallback(async (files: FileList) => {
    setLoadError(null);
    const arr = Array.from(files).filter((f) => isAcceptedFile(f));
    if (!arr.length) return;

    const results = await Promise.all(arr.map(readFileAsImage));
    const ok = results.filter((r): r is LoadedImage => r !== null);
    const failed = arr.length - ok.length;

    if (!ok.length) {
      setLoadError(`Couldn't read ${arr.length === 1 ? "that image" : "any of those images"}. Try a different file.`);
      return;
    }
    if (failed > 0) {
      setLoadError(`Skipped ${failed} unreadable file${failed === 1 ? "" : "s"}.`);
    }
    setPendingImages(ok);
    setStep("ratio");
  }, []);

  const loadWithRatio = useCallback(async (files: FileList, ratioVal: number | null, rLabel: string) => {
    setLoadError(null);
    const arr = Array.from(files).filter((f) => isAcceptedFile(f));
    if (!arr.length) return;

    const results = await Promise.all(arr.map(readFileAsImage));
    const ok = results.filter((r): r is LoadedImage => r !== null);
    const failed = arr.length - ok.length;

    if (!ok.length) {
      setLoadError(`Couldn't read ${arr.length === 1 ? "that image" : "any of those images"}. Try a different file.`);
      return;
    }
    if (failed > 0) {
      setLoadError(`Skipped ${failed} unreadable file${failed === 1 ? "" : "s"}.`);
    }

    const items: CropQueueItem[] = ok.map((img) => {
      const d = computeDisp(img.nat);
      return {
        src: img.src,
        name: img.name,
        natural: img.nat,
        disp: d,
        crop: centered(d.dw, d.dh, ratioVal),
        adjusted: false,
      };
    });
    setQueue(items);
    setCurrentIdx(0);
    setRatio(ratioVal);
    setRatioLabel(rLabel);
    setStep("crop");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const pickRatio = useCallback((v: number | null, label: string) => {
    const items: CropQueueItem[] = pendingImages.map((img) => {
      const d = computeDisp(img.nat);
      return {
        src: img.src,
        name: img.name,
        natural: img.nat,
        disp: d,
        crop: centered(d.dw, d.dh, v),
        adjusted: false,
      };
    });
    setQueue(items);
    setCurrentIdx(0);
    setRatio(v);
    setRatioLabel(label);
    setStep("crop");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [pendingImages]);

  const setCrop = useCallback((crop: CropRect) => {
    setQueue((prev) => {
      const next = [...prev];
      if (next[currentIdx]) {
        next[currentIdx] = { ...next[currentIdx], crop, adjusted: true };
      }
      return next;
    });
  }, [currentIdx]);

  const navigateTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= queue.length) return;
    setCurrentIdx(idx);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [queue.length]);

  const goToRatio = useCallback(() => {
    setPendingImages(queue.map((q) => ({ src: q.src, name: q.name, nat: q.natural })));
    setStep("ratio");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [queue]);

  const reset = useCallback(() => {
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
    step, queue, currentIdx, current, ratio, ratioLabel,
    crop: current?.crop ?? { x: 0, y: 0, w: 0, h: 0 },
    setCrop,
    src: current?.src ?? null,
    name: current?.name ?? "",
    nat: current?.natural ?? { w: 0, h: 0 },
    disp: current?.disp ?? { dw: 0, dh: 0 },
    zoom, setZoom, pan, setPan,
    cropPx, cropPy, isMulti,
    loadError, clearLoadError: () => setLoadError(null),
    loadImage, loadWithRatio, pickRatio, navigateTo, goToRatio, reset,
  };
}
