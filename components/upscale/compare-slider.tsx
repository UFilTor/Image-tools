"use client";

import { useCallback, useRef, useState } from "react";

interface CompareSliderProps {
  /** Original (pre-upscale) image src */
  before: string;
  /** Upscaled result src */
  after: string;
  alt?: string;
  /** Label for the result side (default "Upscaled") */
  afterLabel?: string;
}

/**
 * Before/after comparison slider. Both images render object-contain in the same box
 * (same aspect ratio, so they align pixel-perfectly); the "after" layer is clipped at
 * the divider. Drag with pointer or use arrow keys on the handle.
 */
export function CompareSlider({ before, after, alt = "", afterLabel = "Upscaled" }: CompareSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(50);
  const [dragging, setDragging] = useState(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.min(100, Math.max(0, next)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    updateFromClientX(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    updateFromClientX(e.clientX);
  };

  const endDrag = () => setDragging(false);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      setPct((p) => Math.max(0, p - 5));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      setPct((p) => Math.min(100, p + 5));
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none cursor-ew-resize"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* Before (original) — full layer underneath */}
      <img
        src={before}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-contain"
        draggable={false}
      />
      {/* After (upscaled) — clipped to the right of the divider */}
      <img
        src={after}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-contain"
        style={{ clipPath: `inset(0 0 0 ${pct}%)` }}
        draggable={false}
      />

      {/* Divider + handle */}
      <div
        className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_4px_rgba(0,0,0,0.4)]"
        style={{ left: `${pct}%`, transform: "translateX(-1px)" }}
      />
      <button
        type="button"
        role="slider"
        aria-label="Compare original and upscaled"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        onKeyDown={onKeyDown}
        className="
          absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full
          bg-white shadow-md border border-border cursor-ew-resize
          flex items-center justify-center
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
        "
        style={{ left: `${pct}%` }}
      >
        <svg width="12" height="10" viewBox="0 0 12 10" fill="none" aria-hidden="true">
          <path d="M4 1 1 5l3 4M8 1l3 4-3 4" stroke="#022C12" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Labels */}
      <span className="absolute bottom-1.5 left-1.5 text-[10px] font-semibold text-white bg-black/45 rounded px-1.5 py-0.5 pointer-events-none">
        Original
      </span>
      <span className="absolute bottom-1.5 right-1.5 text-[10px] font-semibold text-white bg-black/45 rounded px-1.5 py-0.5 pointer-events-none">
        {afterLabel}
      </span>
    </div>
  );
}
