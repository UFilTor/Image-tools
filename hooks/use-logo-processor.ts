"use client";

import { useState, useCallback } from "react";
import { NaturalSize } from "@/lib/types";
import { removeBg, recolorCanvas, canvasToDataURL } from "@/lib/logo-processing";

type LogoStep = "upload" | "edit";

export function useLogoProcessor() {
  const [step, setStep] = useState<LogoStep>("upload");
  const [src, setSrc] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nat, setNat] = useState<NaturalSize>({ w: 0, h: 0 });
  const [tolerance, setTolerance] = useState(40);
  const [recolor, setRecolor] = useState("none");
  const [customHex, setCustomHex] = useState("#022C12");
  const [baseCanvas, setBaseCanvas] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const processLogo = useCallback((imgSrc: string, w: number, h: number, tol: number, rec: string, hex: string) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      cv.getContext("2d")!.drawImage(img, 0, 0);
      const removed = removeBg(cv, tol);
      setBaseCanvas(removed);
      let final: HTMLCanvasElement = removed;
      const activeHex = rec === "custom" ? hex : rec;
      if (rec !== "none" && activeHex && /^#[0-9a-fA-F]{6}$/.test(activeHex)) {
        final = recolorCanvas(removed, activeHex);
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
        setTolerance(40);
        setRecolor("none");
        processLogo(result, img.width, img.height, 40, "none", "#022C12");
        setStep("edit");
      };
      img.src = result;
    };
    reader.readAsDataURL(f);
  }, [processLogo]);

  const updateLogo = useCallback((tol: number, rec: string, hex: string) => {
    if (!src) return;
    processLogo(src, nat.w, nat.h, tol, rec, hex);
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
    step, src, name, nat, tolerance, setTolerance,
    recolor, setRecolor, customHex, setCustomHex,
    preview, loadLogo, updateLogo, getExportCanvas, reset,
  };
}
