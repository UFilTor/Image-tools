"use client";

import { useEffect, useRef, useState } from "react";
import { NaturalSize } from "@/lib/types";
import { extendGeometry, renderExtended, previewGeometry, extendSizeError, FillStyle } from "@/lib/extend-utils";

interface ExtendPreviewProps {
  src: string;
  natural: NaturalSize;
  ratio: number | null;
  padding: number;
  fillStyle: FillStyle;
  fillColor: string;
  /** Generated background for the "ai" fill style */
  aiFill?: CanvasImageSource | null;
}

// Subtle checkerboard so transparent/light fills read against the canvas.
const CHECKER =
  "repeating-conic-gradient(#eceae4 0% 25%, #f7f6f2 0% 50%) 50% / 20px 20px";

export function ExtendPreview({ src, natural, ratio, padding, fillStyle, fillColor, aiFill = null }: ExtendPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const el = new Image();
    el.onload = () => { if (!cancelled) setImg(el); };
    el.src = src;
    return () => { cancelled = true; };
  }, [src]);

  const sizeError = extendSizeError(extendGeometry(natural, ratio, padding));

  // Preview renders straight into the visible canvas at display size on every change;
  // full resolution is only rendered on download.
  useEffect(() => {
    const target = canvasRef.current;
    if (!img || !target) return;
    const geo = previewGeometry(extendGeometry(natural, ratio, padding));
    renderExtended(img, geo, { style: fillStyle, color: fillColor, ai: aiFill }, target);
  }, [img, natural, ratio, padding, fillStyle, fillColor, aiFill]);

  return (
    <div
      className="rounded-2xl border border-border p-3 flex items-center justify-center"
      style={{ background: CHECKER }}
    >
      <div className="flex flex-col items-center gap-2">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-[58vh] rounded-lg shadow-sm"
          style={{ objectFit: "contain" }}
        />
        {sizeError && (
          <p className="text-xs text-error font-medium text-center" role="alert">{sizeError}</p>
        )}
      </div>
    </div>
  );
}
