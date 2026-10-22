"use client";

import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import { RATIOS, STORAGE_KEYS, cardText, uploadCards, type UploadCard } from "@/lib/constants";
import { KeyboardHint } from "@/components/ui/keyboard-hint";
import { isOverlayOpen } from "@/lib/overlay-state";
import { useCardKeys } from "@/hooks/use-card-keys";

interface RatioPickerProps {
  onPick: (value: number | null, label: string) => void;
  onBack: () => void;
  subtitle?: string;
  backLabel?: string;
  /** A "Full experience" card (key 4, after Secondary photo) that crops the images as one experience */
  onPickSet?: () => void;
}

/** Hover key for the Full experience card (not a ratio label). */
const SET_KEY = "experience-photos";

/** Last picked ratio label from localStorage, read hydration-safely (server always sees the default). */
const DEFAULT_RATIO = "Square";
const subscribeStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const readSavedRatio = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.lastRatio);
    return saved && RATIOS.some((r) => r.label === saved) ? saved : DEFAULT_RATIO;
  } catch {
    return DEFAULT_RATIO;
  }
};

export function RatioPicker({ onPick, onBack, subtitle, backLabel = "← Go back", onPickSet }: RatioPickerProps) {
  const [hov, setHov] = useState<string | null>(null);
  const highlighted = useSyncExternalStore(subscribeStorage, readSavedRatio, () => DEFAULT_RATIO);

  const cards = useMemo(() => uploadCards(!!onPickSet), [onPickSet]);

  const handlePick = useCallback((value: number | null, label: string) => {
    try {
      localStorage.setItem(STORAGE_KEYS.lastRatio, label);
    } catch {}
    onPick(value, label);
  }, [onPick]);

  const pickCard = (card: UploadCard) => (card.kind === "set" ? onPickSet?.() : handlePick(card.ratio.value, card.ratio.label));
  useCardKeys(cards, pickCard);

  // Enter picks the last used ratio, Escape goes back.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (isOverlayOpen()) return;
      if (e.key === "Enter") {
        e.preventDefault();
        const ratio = RATIOS.find((r) => r.label === highlighted);
        if (ratio) handlePick(ratio.value, ratio.label);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlePick, onBack, highlighted]);

  return (
    <div className="text-center animate-fadeUp">
      {subtitle && (
        <div className="text-[11px] font-bold tracking-[0.16em] uppercase text-primary-muted mb-2.5">
          {subtitle}
        </div>
      )}
      <h2 className="font-display uppercase font-bold text-[32px] text-primary leading-[0.95] tracking-[-0.005em] mb-1.5">
        Choose crop ratio
      </h2>
      <p className="text-sm text-text-muted mb-7">
        Select the aspect ratio for your output
      </p>
      <div className="grid grid-cols-2 gap-2.5 max-w-[320px] mx-auto">
        {cards.map((card, idx) => {
          const isSet = card.kind === "set";
          const { label, sub } = cardText(card);
          const key = isSet ? SET_KEY : label;
          const active = hov === key || (!isSet && label === highlighted);
          return (
            <button
              key={key}
              onClick={() => pickCard(card)}
              onMouseEnter={() => setHov(key)}
              onMouseLeave={() => setHov(null)}
              className={`
                py-4 px-3 rounded-xl border-[1.5px] cursor-pointer transition-[background-color,border-color] duration-150
                ${idx === cards.length - 1 && cards.length % 2 ? "col-span-2" : ""}
                flex flex-col items-center gap-1 relative
                ${active
                  ? "border-primary bg-primary-bg"
                  : "border-border bg-surface"
                }
              `}
            >
              <span className="absolute top-2 right-2">
                <KeyboardHint shortcut={String(idx + 1)} />
              </span>
              <span className="font-display uppercase font-bold text-[18px] text-primary tracking-[0.02em] leading-none">
                {label}
              </span>
              <span className={`text-[12px] font-medium tracking-[0.04em] ${active ? "text-primary-muted" : "text-text-muted"}`}>
                {sub}
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={onBack}
        className="mt-7 bg-transparent border-none text-text-muted hover:text-primary transition-colors text-[13px] cursor-pointer"
      >
        {backLabel}
      </button>
    </div>
  );
}
