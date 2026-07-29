"use client";

import { RATIOS } from "@/lib/constants";
import { FillStyle } from "@/lib/extend-utils";

interface ExtendControlsProps {
  ratio: number | null;
  ratioLabel: string;
  setRatio: (v: number | null, label: string) => void;
  padding: number;
  setPadding: (v: number) => void;
  fillStyle: FillStyle;
  setFillStyle: (v: FillStyle) => void;
  fillColor: string;
  setFillColor: (v: string) => void;
}

const FILL_OPTIONS: { key: FillStyle; label: string }[] = [
  { key: "solid", label: "Solid" },
  { key: "blur", label: "Blurred" },
  { key: "mirror", label: "Mirrored" },
];

const COLOR_PRESETS = [
  { hex: "#ffffff", label: "White" },
  { hex: "#022c12", label: "Forest" },
  { hex: "#000000", label: "Black" },
];

export function ExtendControls({
  ratio, ratioLabel, setRatio, padding, setPadding,
  fillStyle, setFillStyle, fillColor, setFillColor,
}: ExtendControlsProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl px-[22px] py-5 flex flex-col gap-[18px] w-full max-w-[420px]">
      {/* Target ratio */}
      <div>
        <div className="text-[13px] font-semibold text-text mb-2.5">Target ratio</div>
        <div className="flex gap-2 flex-wrap">
          {RATIOS.map((r) => {
            const active = r.value === ratio && r.label === ratioLabel;
            return (
              <button
                key={r.label}
                type="button"
                onClick={() => setRatio(r.value, r.label)}
                className={`
                  inline-flex flex-col items-start px-[14px] py-2 rounded-button cursor-pointer
                  border-[1.5px] text-[13px] font-semibold transition-all duration-150
                  ${active
                    ? "border-primary bg-primary-bg text-primary"
                    : "border-border bg-transparent text-text hover:border-border-hover"
                  }
                `}
              >
                {r.label}
                <span className="text-[10px] font-medium tracking-[0.04em] text-text-muted">{r.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Padding */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[13px] font-semibold text-text">Padding</span>
          <span className="text-[13px] font-semibold text-text-muted tabular-nums">
            {Math.round(padding * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.01}
          value={padding}
          onChange={(e) => setPadding(parseFloat(e.target.value))}
          className="w-full accent-primary cursor-pointer"
          aria-label="Padding amount"
        />
        <p className="text-[11px] text-text-muted mt-1.5">Extra breathing room added around the image on every side.</p>
      </div>

      <div className="h-px bg-border" />

      {/* Fill style */}
      <div>
        <div className="text-[13px] font-semibold text-text mb-2.5">Fill</div>
        <div
          role="group"
          className="inline-flex border border-border rounded-button overflow-hidden text-[13px] font-semibold"
        >
          {FILL_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFillStyle(opt.key)}
              className={`px-4 py-2 transition-all duration-150 ${
                fillStyle === opt.key
                  ? "bg-primary text-accent"
                  : "bg-transparent text-text-muted hover:text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {fillStyle === "solid" && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {COLOR_PRESETS.map((c) => {
              const active = fillColor.toLowerCase() === c.hex;
              return (
                <button
                  key={c.hex}
                  type="button"
                  aria-label={c.label}
                  onClick={() => setFillColor(c.hex)}
                  className={`w-8 h-8 rounded-button shrink-0 transition-all duration-150 ${
                    active ? "ring-2 ring-primary ring-offset-2 ring-offset-surface" : ""
                  }`}
                  style={{ background: c.hex, border: "1px solid rgba(0,0,0,0.18)" }}
                />
              );
            })}
            <input
              type="color"
              value={fillColor}
              onChange={(e) => setFillColor(e.target.value)}
              aria-label="Custom fill color"
              className="w-9 h-9 border-2 border-border rounded-button bg-surface cursor-pointer p-0.5"
            />
          </div>
        )}
        {fillStyle === "blur" && (
          <p className="text-[11px] text-text-muted mt-3">A soft, blurred stretch of the image fills the margin.</p>
        )}
        {fillStyle === "mirror" && (
          <p className="text-[11px] text-text-muted mt-3">The image edges are reflected outward to fill the margin.</p>
        )}
      </div>
    </div>
  );
}
