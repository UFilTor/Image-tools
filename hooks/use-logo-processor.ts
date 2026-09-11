"use client";

import { useState, useCallback, useRef } from "react";
import { NaturalSize } from "@/lib/types";
import { removeBg, recolorCanvas, detectBackground } from "@/lib/logo-processing";
import { BG_TOLERANCE } from "@/lib/constants";
import { canvasToObjectUrl, loadImageEl, revokeSrc } from "@/lib/image-utils";
import { loadImageFiles } from "@/lib/load-images";

type LogoStep = "upload" | "edit";

export function useLogoProcessor() {
  const [step, setStep] = useState<LogoStep>("upload");
  const [src, setSrc] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nat, setNat] = useState<NaturalSize>({ w: 0, h: 0 });
  const [isTransparent, setIsTransparent] = useState(false);
  const [removeBgEnabled, setRemoveBgEnabled] = useState(true);
  const [recolor, setRecolor] = useState("none");
  const [customHex, setCustomHex] = useState("#022C12");
  const [baseCanvas, setBaseCanvas] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Decoded source and detected background, computed once per logo. Toggling controls
  // reuses them instead of re-decoding and re-scanning the full image.
  const imgRef = useRef<HTMLImageElement | null>(null);
  const bgColorRef = useRef<[number, number, number] | null>(null);
  // The bg-removed canvas is cached per bgRemoval flag so recolor changes are a single pass.
  const baseRef = useRef<{ bg: boolean; canvas: HTMLCanvasElement } | null>(null);
  const previewRef = useRef<string | null>(null);
  const srcRef = useRef<string | null>(null);
  const renderGen = useRef(0);


  const render = useCallback(async (doBgRemoval: boolean, rec: string, hex: string) => {
    const img = imgRef.current;
    if (!img) return;
    const myGen = ++renderGen.current;

    let base = baseRef.current?.bg === doBgRemoval ? baseRef.current.canvas : null;
    if (!base) {
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      cv.getContext("2d")!.drawImage(img, 0, 0);
      base = doBgRemoval ? removeBg(cv, BG_TOLERANCE, bgColorRef.current) : cv;
      baseRef.current = { bg: doBgRemoval, canvas: base };
    }
    setBaseCanvas(base);

    let final: HTMLCanvasElement = base;
    const activeHex = rec === "custom" ? hex : rec;
    if (rec !== "none" && activeHex && /^#[0-9a-fA-F]{6}$/.test(activeHex)) {
      final = recolorCanvas(base, activeHex);
    }
    try {
      const url = await canvasToObjectUrl(final);
      if (myGen !== renderGen.current) {
        URL.revokeObjectURL(url);
        return;
      }
      revokeSrc(previewRef.current);
      previewRef.current = url;
      setPreview(url);
    } catch {
      setLoadError("Couldn't render the preview.");
    }
  }, []);

  const loadLogo = useCallback(async (files: FileList) => {
    setLoadError(null);
    const { images, error } = await loadImageFiles(files);
    const [loaded, ...extra] = images;
    extra.forEach((img) => revokeSrc(img.src)); // single-logo tool: release the rest
    if (!loaded) {
      setLoadError(error ?? "Couldn't read that logo. Try a different file.");
      return;
    }
    let img: HTMLImageElement;
    try {
      img = await loadImageEl(loaded.src);
    } catch {
      revokeSrc(loaded.src);
      setLoadError("Couldn't decode that logo. Try a PNG or JPG.");
      return;
    }

    const cv = document.createElement("canvas");
    cv.width = loaded.nat.w;
    cv.height = loaded.nat.h;
    cv.getContext("2d")!.drawImage(img, 0, 0);
    const bg = detectBackground(cv, BG_TOLERANCE);
    // Only treat as "already transparent" when there is no solid box left to remove
    const transparent = bg.hasAlpha && bg.color === null;

    // Drop everything from the previous logo so Enter/Download can't export it under the new name.
    renderGen.current++;
    revokeSrc(srcRef.current);
    revokeSrc(previewRef.current);
    previewRef.current = null;
    srcRef.current = loaded.src;
    imgRef.current = img;
    bgColorRef.current = bg.color;
    baseRef.current = null;
    setBaseCanvas(null);
    setPreview(null);

    setName(loaded.name);
    setNat(loaded.nat);
    setSrc(loaded.src);
    setRecolor("none");
    setIsTransparent(transparent);
    setRemoveBgEnabled(!transparent);
    setStep("edit");
    render(!transparent, "none", "#022C12");
  }, [render]);

  const updateLogo = useCallback((bgRemoval: boolean, rec: string, hex: string) => {
    if (!imgRef.current) return;
    render(bgRemoval, rec, hex);
  }, [render]);

  const getExportCanvas = useCallback((): HTMLCanvasElement | null => {
    if (!baseCanvas) return null;
    const activeHex = recolor === "custom" ? customHex : recolor;
    if (recolor !== "none" && activeHex && /^#[0-9a-fA-F]{6}$/.test(activeHex)) {
      return recolorCanvas(baseCanvas, activeHex);
    }
    return baseCanvas;
  }, [baseCanvas, recolor, customHex]);

  const reset = useCallback(() => {
    renderGen.current++;
    revokeSrc(previewRef.current);
    revokeSrc(srcRef.current);
    previewRef.current = null;
    srcRef.current = null;
    imgRef.current = null;
    baseRef.current = null;
    setStep("upload");
    setSrc(null);
    setPreview(null);
    setBaseCanvas(null);
    setLoadError(null);
  }, []);

  return {
    step, src, name, nat, isTransparent,
    removeBgEnabled, setRemoveBgEnabled,
    recolor, setRecolor, customHex, setCustomHex,
    preview, loadError, clearLoadError: () => setLoadError(null), reportLoadError: setLoadError,
    loadLogo, updateLogo, getExportCanvas, reset,
  };
}
