"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FULL_EXPERIENCE, uploadCards } from "@/lib/constants";
import { prepareFiles, needsConversion } from "@/lib/file-intake";
import { KeyboardHint } from "@/components/ui/keyboard-hint";
import { isOverlayOpen } from "@/lib/overlay-state";

interface RatioDropZonesProps {
  onDropWithRatio: (files: FileList, ratioValue: number | null, ratioLabel: string) => void;
  /** A "Full experience" card (key 4, after Secondary photo) that crops a whole experience's photos */
  onDropSet?: (files: FileList) => void;
}

/** What a click or drop loads into: one ratio for every image, or an experience's photo set. */
type Target = { value: number | null; label: string } | "set";

export function RatioDropZones({ onDropWithRatio, onDropSet }: RatioDropZonesProps) {
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const clickedRatioRef = useRef<Target | null>(null);
  const ratioInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files: FileList, target: Target) => {
    setError(null);
    const converting = needsConversion(files);
    if (converting) setConverting(true);
    try {
      const { files: ready, error: err } = await prepareFiles(files);
      if (err) setError(err);
      if (ready && target === "set") onDropSet?.(ready);
      else if (ready && target !== "set") onDropWithRatio(ready, target.value, target.label);
    } finally {
      if (converting) setConverting(false);
    }
  };

  const cards = useMemo(() => uploadCards(!!onDropSet), [onDropSet]);

  const handleCardClick = (target: Target) => {
    if (converting) return;
    clickedRatioRef.current = target;
    ratioInputRef.current?.click();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (isOverlayOpen()) return;
      const card = cards[parseInt(e.key, 10) - 1];
      if (!card) return;
      e.preventDefault();
      handleCardClick(card.kind === "set" ? "set" : { value: card.ratio.value, label: card.ratio.label });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [converting, cards]);

  return (
    <div>
      {converting && (
        <div className="text-sm text-text-muted animate-pulse text-center mb-3">Converting HEIC...</div>
      )}
      <div className="grid grid-cols-2 gap-3 max-w-[662px] mx-auto">
        {cards.map((card, idx) => {
          const isOver = overIdx === idx;
          const isSet = card.kind === "set";
          const label = isSet ? FULL_EXPERIENCE.label : card.ratio.label;
          const sub = isSet ? FULL_EXPERIENCE.sub : card.ratio.sub;
          const target: Target = isSet ? "set" : { value: card.ratio.value, label };
          return (
            <button
              type="button"
              key={label}
              aria-label={
                isSet
                  ? "Upload a full experience's photos in page order: the first becomes the main photo, the rest secondary photos"
                  : `Upload images at ${label} (${sub}) ratio`
              }
              onClick={() => handleCardClick(target)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
              onDragLeave={() => setOverIdx(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOverIdx(null);
                processFiles(e.dataTransfer.files, target);
              }}
              disabled={converting}
              className={`
                relative border-2 border-dashed rounded-2xl py-5 px-7 cursor-pointer
                ${idx === cards.length - 1 && cards.length % 2 ? "col-span-2" : ""}
                text-center transition-[background-color,border-color] duration-200 flex flex-col items-center gap-1.5
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
              <span className="text-[10px] text-text-muted">
                {isSet ? "Click or drop up to 4 images" : "Click or drop image"}
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
            processFiles(e.target.files, clickedRatioRef.current);
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
