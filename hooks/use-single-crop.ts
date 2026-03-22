"use client";

import { useState, useCallback } from "react";
import { CropRect, NaturalSize, DisplaySize, CropQueueItem } from "@/lib/types";
import { dispSize } from "@/lib/image-utils";
import { centered } from "@/lib/crop-math";

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

  const loadImage = useCallback((files: FileList) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;

    const loaded: LoadedImage[] = [];
    let done = 0;
    arr.forEach((f, i) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          loaded[i] = { src: result, name: f.name, nat: { w: img.width, h: img.height } };
          if (++done === arr.length) {
            setPendingImages(loaded);
            setStep("ratio");
          }
        };
        img.src = result;
      };
      reader.readAsDataURL(f);
    });
  }, []);

  const loadWithRatio = useCallback((files: FileList, ratioVal: number | null, rLabel: string) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;

    const items: CropQueueItem[] = [];
    let done = 0;
    arr.forEach((f, i) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const nat = { w: img.width, h: img.height };
          const d = computeDisp(nat);
          items[i] = {
            src: result,
            name: f.name,
            natural: nat,
            disp: d,
            crop: centered(d.dw, d.dh, ratioVal),
            adjusted: false,
          };
          if (++done === arr.length) {
            setQueue(items);
            setCurrentIdx(0);
            setRatio(ratioVal);
            setRatioLabel(rLabel);
            setStep("crop");
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }
        };
        img.src = result;
      };
      reader.readAsDataURL(f);
    });
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
    setStep("ratio");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

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
    loadImage, loadWithRatio, pickRatio, navigateTo, goToRatio, reset,
  };
}
