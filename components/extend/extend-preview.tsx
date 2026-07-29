"use client";

import { useEffect, useRef, useState } from "react";
import { NaturalSize } from "@/lib/types";
import { extendGeometry, renderExtended, FillStyle } from "@/lib/extend-utils";

interface ExtendPreviewProps {
  src: string;
  natural: NaturalSize;
  ratio: number | null;
  padding: number;
  fillStyle: FillStyle;
  fillColor: string;
}

// Subtle checkerboard so transparent/light fills read against the canvas.
const CHECKER =
  "repeating-conic-gradient(#eceae4 0% 25%, #f7f6f2 0% 50%) 50% / 20px 20px";

export function ExtendPreview({ src, natural, ratio, padding, fillStyle, fillColor }: ExtendPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const el = new Image();
    el.onload = () => { if (!cancelled) setImg(el); };
    el.src = src;
    return () => { cancelled = true; };
  }, [src]);

  useEffect(() => {
    if (!img) return;
    const geo = extendGeometry(natural, ratio, padding);
    const out = renderExtended(img, geo, { style: fillStyle, color: fillColor });
    const target = canvasRef.current;
    if (!target) return;
    target.width = out.width;
    target.height = out.height;
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(out, 0, 0);
  }, [img, natural, ratio, padding, fillStyle, fillColor]);

  return (
    <div
      className="rounded-2xl border border-border p-3 flex items-center justify-center"
      style={{ background: CHECKER }}
    >
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-[58vh] rounded-lg shadow-sm"
        style={{ objectFit: "contain" }}
      />
    </div>
  );
}
