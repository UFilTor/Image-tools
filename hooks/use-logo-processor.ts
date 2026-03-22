"use client";

import { useState, useCallback } from "react";
import { NaturalSize } from "@/lib/types";
import { removeBg, recolorCanvas, canvasToDataURL, hasTransparency } from "@/lib/logo-processing";

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

  const loadLogo = useCallback((files: FileList) => {
    const f = Array.from(files).find((f) => f.type.startsWith("image/"));
    if (!f) return;
    setName(f.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setNat({ w: img.width, h: img.height });
        setSrc(result);
        setRecolor("none");

        // Detect transparency
        const cv = document.createElement("canvas");
        cv.width = img.width;
        cv.height = img.height;
        cv.getContext("2d")!.drawImage(img, 0, 0);
        const transparent = hasTransparency(cv);
        setIsTransparent(transparent);

        if (transparent) {
          // Skip background removal for already-transparent images
          setRemoveBgEnabled(false);
          processLogo(result, img.width, img.height, false, "none", "#022C12");
        } else {
          setRemoveBgEnabled(true);
          processLogo(result, img.width, img.height, true, "none", "#022C12");
        }
        setStep("edit");
      };
      img.src = result;
    };
    reader.readAsDataURL(f);
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
  }, []);

  return {
    step, src, name, nat, isTransparent,
    removeBgEnabled, setRemoveBgEnabled,
    recolor, setRecolor, customHex, setCustomHex,
    preview, loadLogo, updateLogo, getExportCanvas, reset,
  };
}
