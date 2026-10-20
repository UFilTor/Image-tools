"use client";

import { PointerEvent, RefObject, useEffect, useRef, useState } from "react";
import { BoundingBox } from "@/lib/types";
import { clamp01, normalizeBox } from "@/lib/logo-edits";
import type { LogoTool } from "@/hooks/use-logo-processor";

interface PreviewToolsProps {
  imgRef: RefObject<HTMLImageElement | null>;
  tool: LogoTool;
  /** Area of the active color change, outlined on the preview. */
  box: BoundingBox | null;
  onPick: (nx: number, ny: number) => void;
  onBox: (box: BoundingBox) => void;
}

/**
 * Layer exactly over the processed preview image: color picking, area dragging, and the outline
 * of the active area. Positioned from the image's offset box, so the container must be the
 * image's offsetParent (position: relative). The image may be `object-contain` inside a larger
 * box, so the layer covers only the drawn picture, not the letterbox around it. Pointer events
 * pass through when no tool is on.
 */
export function PreviewTools({ imgRef, tool, box, onPick, onBox }: PreviewToolsProps) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [draft, setDraft] = useState<BoundingBox | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const measure = () => {
      const nw = img.naturalWidth, nh = img.naturalHeight;
      if (!nw || !nh) return;
      const s = Math.min(img.offsetWidth / nw, img.offsetHeight / nh);
      const width = nw * s, height = nh * s;
      setRect({
        left: img.offsetLeft + (img.offsetWidth - width) / 2,
        top: img.offsetTop + (img.offsetHeight - height) / 2,
        width,
        height,
      });
    };
    // ResizeObserver reports once on observe, then on every size change (new preview, window resize).
    const ro = new ResizeObserver(measure);
    ro.observe(img);
    img.addEventListener("load", measure);
    return () => {
      ro.disconnect();
      img.removeEventListener("load", measure);
    };
  }, [imgRef]);

  const toNorm = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };

  if (!rect || !rect.width) return null;
  const shown = draft ?? box;

  return (
    <div
      aria-hidden="true"
      className={`absolute ${tool ? "cursor-crosshair touch-none" : "pointer-events-none"}`}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      onPointerDown={(e) => {
        if (tool !== "box") return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = toNorm(e);
        setDraft(null);
      }}
      onPointerMove={(e) => {
        if (tool === "box" && start.current) setDraft(normalizeBox(start.current, toNorm(e), 0));
      }}
      onPointerUp={(e) => {
        if (tool === "pick") {
          const p = toNorm(e);
          onPick(p.x, p.y);
          return;
        }
        if (tool === "box" && start.current) {
          const b = normalizeBox(start.current, toNorm(e));
          start.current = null;
          setDraft(null);
          if (b) onBox(b);
        }
      }}
    >
      {shown && (
        <div
          className="absolute border-2 border-dashed border-primary rounded-sm"
          style={{
            left: `${shown.x1 * 100}%`,
            top: `${shown.y1 * 100}%`,
            width: `${(shown.x2 - shown.x1) * 100}%`,
            height: `${(shown.y2 - shown.y1) * 100}%`,
            // White halo keeps the dashed line visible on dark logos too.
            boxShadow: "0 0 0 1px rgba(255,255,255,0.9), inset 0 0 0 1px rgba(255,255,255,0.9)",
          }}
        />
      )}
    </div>
  );
}
