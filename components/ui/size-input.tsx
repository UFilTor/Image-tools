"use client";

import { useState } from "react";
import { CropRect, DisplaySize, NaturalSize } from "@/lib/types";

interface SizeInputProps {
  cropPx: number;
  cropPy: number;
  ratio: number | null;
  crop: CropRect;
  setCrop: (c: CropRect) => void;
  disp: DisplaySize;
  nat: NaturalSize;
}

export function SizeInput({ cropPx, cropPy, ratio, crop, setCrop, disp, nat }: SizeInputProps) {
  const [editW, setEditW] = useState<string | null>(null);
  const [editH, setEditH] = useState<string | null>(null);

  const applyWidth = (val: string) => {
    const newW = parseInt(val, 10);
    if (!newW || newW < 10) return;
    const scale = disp.dw / nat.w;
    let dw = newW * scale;
    dw = Math.max(60, Math.min(dw, disp.dw));
    let dh: number;
    if (ratio !== null) {
      dh = dw / ratio;
      if (dh > disp.dh) { dh = disp.dh; dw = dh * ratio; }
    } else {
      dh = crop.h; // keep current height in free mode
    }
    const cx = crop.x + crop.w / 2;
    const cy = crop.y + crop.h / 2;
    setCrop({
      x: Math.round(Math.max(0, Math.min(cx - dw / 2, disp.dw - dw))),
      y: Math.round(Math.max(0, Math.min(cy - dh / 2, disp.dh - dh))),
      w: Math.round(dw),
      h: Math.round(dh),
    });
  };

  const applyHeight = (val: string) => {
    const newH = parseInt(val, 10);
    if (!newH || newH < 10) return;
    const scale = disp.dh / nat.h;
    let dh = newH * scale;
    dh = Math.max(60, Math.min(dh, disp.dh));
    let dw: number;
    if (ratio !== null) {
      dw = dh * ratio;
      if (dw > disp.dw) { dw = disp.dw; dh = dw / ratio; }
    } else {
      dw = crop.w; // keep current width in free mode
    }
    const cx = crop.x + crop.w / 2;
    const cy = crop.y + crop.h / 2;
    setCrop({
      x: Math.round(Math.max(0, Math.min(cx - dw / 2, disp.dw - dw))),
      y: Math.round(Math.max(0, Math.min(cy - dh / 2, disp.dh - dh))),
      w: Math.round(dw),
      h: Math.round(dh),
    });
  };

  const inputClass =
    "w-[62px] bg-white border border-border rounded-md text-text text-xs font-medium px-2 py-1.5 text-center tabular-nums outline-none focus:border-border-focus transition-colors";

  return (
    <div className="flex items-center gap-1 bg-surface border border-border rounded-lg px-1 py-0.5">
      <input
        type="text"
        inputMode="numeric"
        value={editW !== null ? editW : cropPx}
        onChange={(e) => setEditW(e.target.value.replace(/[^0-9]/g, ""))}
        onFocus={(e) => { setEditW(String(cropPx)); e.target.select(); }}
        onBlur={() => { if (editW !== null) applyWidth(editW); setEditW(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { applyWidth(editW!); setEditW(null); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") { setEditW(null); (e.target as HTMLInputElement).blur(); }
        }}
        className={inputClass}
      />
      <span className="text-text-muted text-xs font-semibold">&times;</span>
      <input
        type="text"
        inputMode="numeric"
        value={editH !== null ? editH : cropPy}
        onChange={(e) => setEditH(e.target.value.replace(/[^0-9]/g, ""))}
        onFocus={(e) => { setEditH(String(cropPy)); e.target.select(); }}
        onBlur={() => { if (editH !== null) applyHeight(editH); setEditH(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { applyHeight(editH!); setEditH(null); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") { setEditH(null); (e.target as HTMLInputElement).blur(); }
        }}
        className={inputClass}
      />
      <span className="text-text-dim text-[10px] font-medium ml-0.5 mr-0.5">px</span>
    </div>
  );
}
