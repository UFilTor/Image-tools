"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ExtendQueueItem } from "@/lib/types";
import { revokeSrc, LoadedImage, loadImageEl } from "@/lib/image-utils";
import { loadImageFiles } from "@/lib/load-images";
import { FillStyle, aiFillKey, buildFillRequest, extendGeometry, extendSizeError, hasMargin } from "@/lib/extend-utils";
import { checkGatewayAvailable, requestImageEdit } from "@/lib/ai-client";
import { errorMessage } from "@/lib/errors";

/** A generated fill for one image at one geometry. */
interface AiFill {
  status: "busy" | "done" | "error";
  img?: HTMLImageElement;
  error?: string;
}

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gatewayAvailable, setGatewayAvailable] = useState(false);
  // Generated fills by aiFillKey, so going back to an earlier ratio/padding reuses a paid result.
  const [aiFills, setAiFills] = useState<Record<string, AiFill>>({});
  const aiFillsRef = useRef(aiFills);
  useEffect(() => {
    aiFillsRef.current = aiFills;
  }, [aiFills]);

  const current = queue[currentIdx] || null;
  const currentGeo = current ? extendGeometry(current.natural, ratio, padding) : null;
  const aiFill = current && currentGeo ? aiFills[aiFillKey(current.src, currentGeo)] ?? null : null;
  // Why "Generate fill" can't run right now, or null. Too-large canvases can't be downloaded,
  // so paying for their fill would be wasted.
  const aiBlocked = !currentGeo
    ? null
    : !hasMargin(currentGeo)
      ? "Add padding or pick another ratio. There is no margin to fill yet."
      : extendSizeError(currentGeo)
        ? "Too large to generate. Reduce padding or pick another ratio."
        : null;

  const srcsRef = useRef<string[]>([]);
  useEffect(() => {
    srcsRef.current = queue.map((q) => q.src);
  }, [queue]);

  const load = useCallback(async (files: FileList): Promise<LoadedImage[] | null> => {
    setLoadError(null);
    void checkGatewayAvailable().then(setGatewayAvailable);
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

  /** Generate an AI fill for the current image at the current ratio and padding (one paid call). */
  const generateFill = useCallback(async () => {
    if (!current) return;
    const geo = extendGeometry(current.natural, ratio, padding);
    if (!hasMargin(geo) || extendSizeError(geo)) return;
    const key = aiFillKey(current.src, geo);
    const prev = aiFillsRef.current[key];
    if (prev?.status === "busy") return;
    // Keep the previous (paid) fill visible while regenerating, and keep it if the new run fails.
    setAiFills((f) => ({ ...f, [key]: { status: "busy", img: prev?.img } }));
    try {
      const img = await loadImageEl(current.src);
      const { image, mask } = await buildFillRequest(img, geo);
      const form = new FormData();
      form.set("purpose", "extend");
      form.set("image", image, "image.jpg");
      form.set("mask", mask, "mask.png");
      const out = await requestImageEdit(form);
      setAiFills((f) => ({ ...f, [key]: { status: "done", img: out } }));
    } catch (err: unknown) {
      const error = errorMessage(err);
      setAiFills((f) => ({ ...f, [key]: prev?.img ? { status: "done", img: prev.img, error } : { status: "error", error } }));
    }
  }, [current, ratio, padding]);

  /** Generated fill for any queue item at the current settings (used by Download all). */
  const aiFor = useCallback(
    (item: ExtendQueueItem) => aiFills[aiFillKey(item.src, extendGeometry(item.natural, ratio, padding))]?.img ?? null,
    [aiFills, ratio, padding],
  );

  const reset = useCallback(() => {
    setAiFills({});
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
    gatewayAvailable, aiFill, generateFill, aiFor,
    aiBlocked,
    isMulti,
    loadError, clearLoadError: () => setLoadError(null), reportLoadError: setLoadError,
    loadImage, loadWithRatio, navigateTo, reset,
  };
}
