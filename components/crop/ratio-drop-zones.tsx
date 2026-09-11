"use client";

import { useEffect, useRef, useState } from "react";
import { RATIOS } from "@/lib/constants";
import { prepareFiles, needsConversion } from "@/lib/file-intake";
import { KeyboardHint } from "@/components/ui/keyboard-hint";
import { isOverlayOpen } from "@/lib/overlay-state";

interface RatioDropZonesProps {
  onDropWithRatio: (files: FileList, ratioValue: number | null, ratioLabel: string) => void;
}

export function RatioDropZones({ onDropWithRatio }: RatioDropZonesProps) {
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const clickedRatioRef = useRef<{ value: number | null; label: string } | null>(null);
  const ratioInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files: FileList, ratioValue: number | null, ratioLabel: string) => {
    setError(null);
    const converting = needsConversion(files);
    if (converting) setConverting(true);
    try {
      const { files: ready, error: err } = await prepareFiles(files);
      if (err) setError(err);
      if (ready) onDropWithRatio(ready, ratioValue, ratioLabel);
    } finally {
      if (converting) setConverting(false);
    }
  };

  const handleCardClick = (value: number | null, label: string) => {
    if (converting) return;
    clickedRatioRef.current = { value, label };
    ratioInputRef.current?.click();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (isOverlayOpen()) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= RATIOS.length) {
        e.preventDefault();
        const r = RATIOS[num - 1];
        handleCardClick(r.value, r.label);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [converting]);

  return (
    <div>
      {converting && (
        <div className="text-sm text-text-muted animate-pulse text-center mb-3">Converting HEIC...</div>
      )}
      <div className="grid grid-cols-2 gap-4 max-w-[662px] mx-auto">
        {RATIOS.map(({ label, sub, value }, idx) => {
          const isOver = overIdx === idx;
          return (
            <button
              type="button"
              key={label}
              aria-label={`Upload images at ${label} (${sub}) ratio`}
              onClick={() => handleCardClick(value, label)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
              onDragLeave={() => setOverIdx(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOverIdx(null);
                processFiles(e.dataTransfer.files, value, label);
              }}
              disabled={converting}
              className={`
                relative border-2 border-dashed rounded-2xl pt-12 pb-8 px-7 cursor-pointer
                text-center transition-[background-color,border-color] duration-200 flex flex-col items-center gap-2
                hover:border-primary hover:bg-primary-bg
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg
                disabled:cursor-not-allowed
                ${isOver ? "border-primary bg-primary-bg" : "border-border bg-surface"}
              `}
            >
              <span className="absolute top-2.5 right-2.5 hidden sm:inline-flex">
                <KeyboardHint shortcut={String(idx + 1)} />
              </span>
              <span className="font-display uppercase font-bold text-[18px] text-primary tracking-[0.02em] leading-none">
                {label}
              </span>
              <span className="text-[12px] font-medium tracking-[0.04em] text-text-muted">
                {sub}
              </span>
              <span className="text-[10px] text-text-muted mt-1">
                Click or drop image
              </span>
            </button>
          );
        })}
      </div>
      <input
        ref={ratioInputRef}
        type="file"
        accept="image/*,.heic,.heif,.svg,.avif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && clickedRatioRef.current) {
            processFiles(e.target.files, clickedRatioRef.current.value, clickedRatioRef.current.label);
          }
          clickedRatioRef.current = null;
          e.target.value = "";
        }}
      />
      {error && (
        <p className="mt-3 text-sm text-error font-medium text-center">{error}</p>
      )}
    </div>
  );
}
