"use client";

import { useState, useEffect, useCallback } from "react";
import { RATIOS, STORAGE_KEYS } from "@/lib/constants";
import { KeyboardHint } from "@/components/ui/keyboard-hint";

interface RatioPickerProps {
  onPick: (value: number | null, label: string) => void;
  onBack: () => void;
  subtitle?: string;
  backLabel?: string;
}

export function RatioPicker({ onPick, onBack, subtitle, backLabel = "← Go back" }: RatioPickerProps) {
  const [hov, setHov] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string>("Square");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.lastRatio);
      if (saved && RATIOS.some((r) => r.label === saved)) {
        setHighlighted(saved);
      }
    } catch {}
  }, []);

  const handlePick = useCallback((value: number | null, label: string) => {
    try {
      localStorage.setItem(STORAGE_KEYS.lastRatio, label);
    } catch {}
    onPick(value, label);
  }, [onPick]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < RATIOS.length) {
        e.preventDefault();
        handlePick(RATIOS[idx].value, RATIOS[idx].label);
      }
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
        {RATIOS.map(({ label, sub, value }, idx) => {
          const isHighlighted = label === highlighted;
          const isHovered = hov === label;
          const active = isHovered || isHighlighted;
          return (
            <button
              key={label}
              onClick={() => handlePick(value, label)}
              onMouseEnter={() => setHov(label)}
              onMouseLeave={() => setHov(null)}
              className={`
                py-4 px-3 rounded-xl border-[1.5px] cursor-pointer transition-all duration-150
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
