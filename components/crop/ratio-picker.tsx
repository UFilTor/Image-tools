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
        <div className="text-[11px] font-bold tracking-[0.14em] uppercase text-primary-muted mb-3">
          {subtitle}
        </div>
      )}
      <div className="text-2xl font-bold text-text mb-2 tracking-tight">
        Choose crop ratio
      </div>
      <div className="text-sm text-text-muted mb-8">
        Select the aspect ratio for your output
      </div>
      <div className="grid grid-cols-2 gap-2.5 max-w-[320px] mx-auto">
        {RATIOS.map(({ label, sub, value }, idx) => {
          const isHighlighted = label === highlighted;
          const isHovered = hov === label;
          return (
            <button
              key={label}
              onClick={() => handlePick(value, label)}
              onMouseEnter={() => setHov(label)}
              onMouseLeave={() => setHov(null)}
              className={`
                py-3.5 rounded-xl border-[1.5px] cursor-pointer transition-all duration-150
                flex flex-col items-center gap-1 relative
                ${isHovered || isHighlighted
                  ? "border-primary bg-primary-bg"
                  : "border-border bg-white"
                }
              `}
            >
              <span className={`text-[15px] font-bold ${isHovered || isHighlighted ? "text-primary" : "text-text"}`}>
                {label}
              </span>
              <span className={`text-[11px] font-medium ${isHovered || isHighlighted ? "text-primary-muted" : "text-text-muted"}`}>
                {sub}
              </span>
              <span className="absolute top-2 right-2">
                <KeyboardHint shortcut={String(idx + 1)} />
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={onBack}
        className="mt-7 bg-transparent border-none text-text-muted text-[13px] cursor-pointer"
      >
        {backLabel}
      </button>
    </div>
  );
}
