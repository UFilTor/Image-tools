"use client";

import { useState, useCallback } from "react";
import { NaturalSize } from "@/lib/types";
import { removeBg, recolorCanvas, canvasToDataURL, hasTransparency } from "@/lib/logo-processing";
import { isAcceptedFile } from "@/lib/constants";
import { readFileAsImage } from "@/lib/image-utils";

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

  const processLogo = useCallback((imgSrc: string, w: number, h: number, doBgRemoval: boolean, rec: string, hex: string) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      cv.getContext("2d")!.drawImage(img, 0, 0);

      let processed = cv;
      if (doBgRemoval) {
        processed = removeBg(cv, 40);
      }
      setBaseCanvas(processed);

      let final: HTMLCanvasElement = processed;
      const activeHex = rec === "custom" ? hex : rec;
      if (rec !== "none" && activeHex && /^#[0-9a-fA-F]{6}$/.test(activeHex)) {
        final = recolorCanvas(processed, activeHex);
      }
      setPreview(canvasToDataURL(final));
    };
    img.src = imgSrc;
  }, []);

  const loadLogo = useCallback(async (files: FileList) => {
    setLoadError(null);
    const f = Array.from(files).find((f) => isAcceptedFile(f));
    if (!f) return;
    const loaded = await readFileAsImage(f);
    if (!loaded) {
      setLoadError("Couldn't read that logo. Try a different file.");
      return;
    }
    setName(loaded.name);
    setNat(loaded.nat);
    setSrc(loaded.src);
    setRecolor("none");

    const cv = document.createElement("canvas");
    cv.width = loaded.nat.w;
    cv.height = loaded.nat.h;
    const tmp = new Image();
    tmp.onload = () => {
      cv.getContext("2d")!.drawImage(tmp, 0, 0);
      const transparent = hasTransparency(cv);
      setIsTransparent(transparent);
      if (transparent) {
        setRemoveBgEnabled(false);
        processLogo(loaded.src, loaded.nat.w, loaded.nat.h, false, "none", "#022C12");
      } else {
        setRemoveBgEnabled(true);
        processLogo(loaded.src, loaded.nat.w, loaded.nat.h, true, "none", "#022C12");
      }
      setStep("edit");
    };
    tmp.src = loaded.src;
  }, [processLogo]);

  const updateLogo = useCallback((bgRemoval: boolean, rec: string, hex: string) => {
    if (!src) return;
    processLogo(src, nat.w, nat.h, bgRemoval, rec, hex);
  }, [src, nat, processLogo]);

  const getExportCanvas = useCallback((): HTMLCanvasElement | null => {
    if (!baseCanvas) return null;
    const activeHex = recolor === "custom" ? customHex : recolor;
    if (recolor !== "none" && activeHex && /^#[0-9a-fA-F]{6}$/.test(activeHex)) {
      return recolorCanvas(baseCanvas, activeHex);
    }
    return baseCanvas;
  }, [baseCanvas, recolor, customHex]);

  const reset = useCallback(() => {
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
    preview, loadError, clearLoadError: () => setLoadError(null),
    loadLogo, updateLogo, getExportCanvas, reset,
  };
}
