"use client";

import { useState, useEffect } from "react";
import { RATIOS } from "@/lib/constants";
import { KeyboardHint } from "@/components/ui/keyboard-hint";

interface RatioPickerProps {
  onPick: (value: number | null, label: string) => void;
  onBack: () => void;
  subtitle?: string;
  backLabel?: string;
}

export function RatioPicker({ onPick, onBack, subtitle, backLabel = "← Go back" }: RatioPickerProps) {
  const [hov, setHov] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < RATIOS.length) {
        e.preventDefault();
        onPick(RATIOS[idx].value, RATIOS[idx].label);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPick, onBack]);

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
        {RATIOS.map(({ label, sub, value }, idx) => (
          <button
            key={label}
            onClick={() => onPick(value, label)}
            onMouseEnter={() => setHov(label)}
            onMouseLeave={() => setHov(null)}
            className={`
              py-3.5 rounded-xl border-[1.5px] cursor-pointer transition-all duration-150
              flex flex-col items-center gap-1 relative
              ${hov === label
                ? "border-primary bg-primary-bg"
                : "border-border bg-white"
              }
            `}
          >
            <span className={`text-[15px] font-bold ${hov === label ? "text-primary" : "text-text"}`}>
              {label}
            </span>
            <span className={`text-[11px] font-medium ${hov === label ? "text-primary-muted" : "text-text-muted"}`}>
              {sub}
            </span>
            <span className="absolute top-2 right-2">
              <KeyboardHint shortcut={String(idx + 1)} />
            </span>
          </button>
        ))}
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
