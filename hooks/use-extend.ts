"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ExtendQueueItem } from "@/lib/types";
import { revokeSrc, LoadedImage } from "@/lib/image-utils";
import { loadImageFiles } from "@/lib/load-images";
import { FillStyle } from "@/lib/extend-utils";
import { safeZoneForRatio } from "@/lib/storefront";

type ExtendStep = "upload" | "edit";

export function useExtend() {
  const [step, setStep] = useState<ExtendStep>("upload");
  const [queue, setQueue] = useState<ExtendQueueItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [ratio, setRatioState] = useState<number | null>(1);
  const [ratioLabel, setRatioLabel] = useState("Square");
  const [padding, setPadding] = useState(0);
  const [fillStyle, setFillStyle] = useState<FillStyle>("solid");
  const [fillColor, setFillColor] = useState("#ffffff");
  // "Fit inside safe zone": only applies to storefront presets, which have a safe zone.
  const [fitSafe, setFitSafe] = useState(false);
  // Memoized: ExtendPreview redraws when `safe` changes, and the provider re-renders on every
  // tool's state change (Upscale progress included).
  const safe = useMemo(() => (fitSafe ? safeZoneForRatio(ratio) : null), [fitSafe, ratio]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const current = queue[currentIdx] || null;

  const srcsRef = useRef<string[]>([]);
  useEffect(() => {
    srcsRef.current = queue.map((q) => q.src);
  }, [queue]);

  const load = useCallback(async (files: FileList): Promise<LoadedImage[] | null> => {
    setLoadError(null);
    const { images, error } = await loadImageFiles(files);
    if (error) setLoadError(error);
    return images.length ? images : null;
  }, []);

  const buildItems = (imgs: LoadedImage[]): ExtendQueueItem[] =>
    imgs.map((img) => ({ src: img.src, name: img.name, natural: img.nat, adjusted: false }));

  const loadImage = useCallback(async (files: FileList) => {
    const ok = await load(files);
    if (!ok) return;
    setQueue(buildItems(ok));
    setCurrentIdx(0);
    setStep("edit");
  }, [load]);

  const loadWithRatio = useCallback(async (files: FileList, ratioVal: number | null, rLabel: string) => {
    const ok = await load(files);
    if (!ok) return;
    setQueue(buildItems(ok));
    setCurrentIdx(0);
    setRatioState(ratioVal);
    setRatioLabel(rLabel);
    setStep("edit");
  }, [load]);

  const setRatio = useCallback((v: number | null, label: string) => {
    setRatioState(v);
    setRatioLabel(label);
  }, []);

  const navigateTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= queue.length) return;
    setCurrentIdx(idx);
  }, [queue.length]);

  const reset = useCallback(() => {
    srcsRef.current.forEach(revokeSrc);
    setQueue([]);
    setCurrentIdx(0);
    setStep("upload");
  }, []);

  const isMulti = queue.length > 1;

  return {
    step, queue, currentIdx, current,
    ratio, ratioLabel, setRatio,
    padding, setPadding,
    fillStyle, setFillStyle,
    fillColor, setFillColor,
    fitSafe, setFitSafe,
    /** Safe zone the canvas must fit the image into, or null (fit off, or not a storefront preset) */
    safe,
    isMulti,
    loadError, clearLoadError: () => setLoadError(null), reportLoadError: setLoadError,
    loadImage, loadWithRatio, navigateTo, reset,
  };
}
