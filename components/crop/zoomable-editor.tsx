"use client";

import { useRef, useEffect, useCallback, ReactNode } from "react";
import { CropRect, DisplaySize, CropDragType } from "@/lib/types";
import { CropOverlay } from "./crop-overlay";

interface ZoomableEditorProps {
  src: string;
  disp: DisplaySize;
  crop: CropRect;
  setCrop: (c: CropRect) => void;
  ratio: number;
  onDown: (e: React.MouseEvent, type: CropDragType) => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  pan: { x: number; y: number };
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}

export function ZoomableEditor({
  src, disp, crop, setCrop, ratio, onDown, zoom, setZoom, pan, setPan,
}: ZoomableEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    sx: number; sy: number; sp: { x: number; y: number };
  } | null>(null);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(1, Math.min(5, z + (e.deltaY < 0 ? 0.15 : -0.15))));
  }, [setZoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.altKey && e.button === 0)) {
      e.preventDefault();
      panRef.current = { sx: e.clientX, sy: e.clientY, sp: { ...pan } };
      const move = (me: MouseEvent) => {
        if (!panRef.current) return;
        setPan({
          x: panRef.current.sp.x + me.clientX - panRef.current.sx,
          y: panRef.current.sp.y + me.clientY - panRef.current.sy,
        });
      };
      const up = () => {
        panRef.current = null;
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    }
  }, [pan, setPan]);

  const maxPanX = (disp.dw * (zoom - 1)) / 2;
  const maxPanY = (disp.dh * (zoom - 1)) / 2;
  const cp = {
    x: Math.max(-maxPanX, Math.min(maxPanX, pan.x)),
    y: Math.max(-maxPanY, Math.min(maxPanY, pan.y)),
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handlePanStart}
      className="relative select-none rounded-xl overflow-hidden border border-border"
      style={{ width: disp.dw, height: disp.dh, cursor: zoom > 1 ? "grab" : "default" }}
    >
      <div style={{
        width: disp.dw,
        height: disp.dh,
        transform: `scale(${zoom}) translate(${cp.x / zoom}px, ${cp.y / zoom}px)`,
        transformOrigin: "center center",
      }}>
        <img src={src} draggable={false} className="block pointer-events-none" style={{ width: disp.dw, height: disp.dh }} />
        <CropOverlay crop={crop} onDown={onDown} />
      </div>

      {zoom > 1 && (
        <div className="absolute bottom-2.5 right-2.5 z-20 bg-black/60 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm flex items-center gap-2">
          <span>{Math.round(zoom * 100)}%</span>
          <button
            onClick={(e) => { e.stopPropagation(); setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="bg-transparent border-none text-white/70 cursor-pointer text-[11px] p-0"
          >
            Reset
          </button>
        </div>
      )}
      {zoom === 1 && (
        <div className="absolute bottom-2.5 right-2.5 z-20 bg-black/45 rounded-lg px-2.5 py-1 text-[10px] text-white/70 pointer-events-none">
          Scroll to zoom · Alt+drag to pan
        </div>
      )}
    </div>
  );
}
