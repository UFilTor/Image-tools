"use client";

import { useState, useCallback } from "react";
import { NaturalSize, ExtendQueueItem } from "@/lib/types";
import { readFileAsImage } from "@/lib/image-utils";
import { isAcceptedFile } from "@/lib/constants";
import { FillStyle } from "@/lib/extend-utils";

type ExtendStep = "upload" | "edit";

interface LoadedImage {
  src: string;
  name: string;
  nat: NaturalSize;
}

export function useExtend() {
  const [step, setStep] = useState<ExtendStep>("upload");
  const [queue, setQueue] = useState<ExtendQueueItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [ratio, setRatioState] = useState<number | null>(1);
  const [ratioLabel, setRatioLabel] = useState("Square");
  const [padding, setPadding] = useState(0);
  const [fillStyle, setFillStyle] = useState<FillStyle>("solid");
  const [fillColor, setFillColor] = useState("#ffffff");
  const [loadError, setLoadError] = useState<string | null>(null);

  const current = queue[currentIdx] || null;

  const loadFiles = useCallback(async (files: FileList): Promise<LoadedImage[] | null> => {
    setLoadError(null);
    const arr = Array.from(files).filter((f) => isAcceptedFile(f));
    if (!arr.length) return null;

    const results = await Promise.all(arr.map(readFileAsImage));
    const ok = results.filter((r): r is LoadedImage => r !== null);
    const failed = arr.length - ok.length;

    if (!ok.length) {
      setLoadError(`Couldn't read ${arr.length === 1 ? "that image" : "any of those images"}. Try a different file.`);
      return null;
    }
    if (failed > 0) {
      setLoadError(`Skipped ${failed} unreadable file${failed === 1 ? "" : "s"}.`);
    }
    return ok;
  }, []);

  const buildItems = (imgs: LoadedImage[]): ExtendQueueItem[] =>
    imgs.map((img) => ({ src: img.src, name: img.name, natural: img.nat, adjusted: false }));

  const loadImage = useCallback(async (files: FileList) => {
    const ok = await loadFiles(files);
    if (!ok) return;
    setQueue(buildItems(ok));
    setCurrentIdx(0);
    setStep("edit");
  }, [loadFiles]);

  const loadWithRatio = useCallback(async (files: FileList, ratioVal: number | null, rLabel: string) => {
    const ok = await loadFiles(files);
    if (!ok) return;
    setQueue(buildItems(ok));
    setCurrentIdx(0);
    setRatioState(ratioVal);
    setRatioLabel(rLabel);
    setStep("edit");
  }, [loadFiles]);

  const setRatio = useCallback((v: number | null, label: string) => {
    setRatioState(v);
    setRatioLabel(label);
  }, []);

  const navigateTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= queue.length) return;
    setCurrentIdx(idx);
  }, [queue.length]);

  const reset = useCallback(() => {
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
    isMulti,
    loadError, clearLoadError: () => setLoadError(null),
    loadImage, loadWithRatio, navigateTo, reset,
  };
}
