"use client";

import { useState, useCallback } from "react";
import { CropRect, NaturalSize, DisplaySize } from "@/lib/types";
import { dispSize } from "@/lib/image-utils";
import { centered } from "@/lib/crop-math";

type SingleStep = "upload" | "ratio" | "crop";

export function useSingleCrop() {
  const [step, setStep] = useState<SingleStep>("upload");
  const [src, setSrc] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nat, setNat] = useState<NaturalSize>({ w: 0, h: 0 });
  const [disp, setDisp] = useState<DisplaySize>({ dw: 0, dh: 0 });
  const [ratio, setRatio] = useState(1);
  const [ratioLabel, setRatioLabel] = useState("1:1");
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const loadImage = useCallback((files: FileList) => {
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
        setStep("ratio");
      };
      img.src = result;
    };
    reader.readAsDataURL(f);
  }, []);

  const pickRatio = useCallback((v: number | null, label: string) => {
    const eff = v ?? nat.w / nat.h;
    const d = dispSize(nat.w, nat.h, Math.min(window.innerWidth - 96, nat.w), Math.min(window.innerHeight - 230, nat.h));
    setDisp(d);
    setRatio(eff);
    setRatioLabel(label);
    setCrop(centered(d.dw, d.dh, eff));
    setStep("crop");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [nat]);

  const goToRatio = useCallback(() => {
    setStep("ratio");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const reset = useCallback(() => {
    setSrc(null);
    setStep("upload");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const cropPx = Math.round((crop.w * nat.w) / (disp.dw || 1));
  const cropPy = Math.round((crop.h * nat.h) / (disp.dh || 1));

  return {
    step, src, name, nat, disp, ratio, ratioLabel,
    crop, setCrop, zoom, setZoom, pan, setPan,
    cropPx, cropPy,
    loadImage, pickRatio, goToRatio, reset,
  };
}
