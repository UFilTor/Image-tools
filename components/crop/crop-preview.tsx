"use client";

import { useRef, useEffect } from "react";
import { CropRect, NaturalSize, DisplaySize } from "@/lib/types";

interface CropPreviewProps {
  src: string;
  nat: NaturalSize;
  disp: DisplaySize;
  crop: CropRect;
}

export function CropPreview({ src, nat, disp, crop }: CropPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Load image once
  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; };
    img.src = src;
  }, [src]);

  // Redraw on crop change
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !crop.w || !crop.h) return;

    const raf = requestAnimationFrame(() => {
      const sx = (crop.x / disp.dw) * nat.w;
      const sy = (crop.y / disp.dh) * nat.h;
      const sw = (crop.w / disp.dw) * nat.w;
      const sh = (crop.h / disp.dh) * nat.h;

      const previewW = 200;
      const previewH = (sh / sw) * previewW;

      canvas.width = previewW;
      canvas.height = previewH;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, previewW, previewH);
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [src, nat, disp, crop]);

  return (
    <div className="hidden lg:flex flex-col items-center gap-2 shrink-0">
      <span className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.1em]">
        Preview
      </span>
      <canvas
        ref={canvasRef}
        className="rounded-lg border border-border max-w-[200px]"
      />
    </div>
  );
}
