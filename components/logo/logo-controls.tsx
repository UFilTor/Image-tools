"use client";

import { LOGO_RECOLOR_PRESETS } from "@/lib/constants";

interface LogoControlsProps {
  tolerance: number;
  setTolerance: (v: number) => void;
  recolor: string;
  setRecolor: (v: string) => void;
  customHex: string;
  setCustomHex: (v: string) => void;
  onUpdate: (tolerance: number, recolor: string, customHex: string) => void;
}

export function LogoControls({
  tolerance, setTolerance, recolor, setRecolor, customHex, setCustomHex, onUpdate,
}: LogoControlsProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-5">
      {/* Tolerance slider */}
      <div>
        <div className="flex justify-between items-center mb-2.5">
          <span className="text-[13px] font-semibold text-text">Background removal</span>
          <span className="text-xs text-text-muted tabular-nums font-medium">{tolerance}</span>
        </div>
        <input
          type="range"
          min="5"
          max="120"
          step="1"
          value={tolerance}
          onChange={(e) => setTolerance(+e.target.value)}
          onMouseUp={() => onUpdate(tolerance, recolor, customHex)}
          onTouchEnd={() => onUpdate(tolerance, recolor, customHex)}
          className="w-full accent-primary cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-text-dim mt-1">
          <span>Less removal</span>
          <span>More removal</span>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Recolor options */}
      <div>
        <div className="text-[13px] font-semibold text-text mb-3">Recolor</div>
        <div className="flex gap-2 flex-wrap items-center">
          {LOGO_RECOLOR_PRESETS.map((opt) => {
            const active = recolor === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => {
                  setRecolor(opt.key);
                  onUpdate(tolerance, opt.key, customHex);
                }}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer
                  border-[1.5px] text-[13px] font-semibold transition-all duration-150
                  ${active
                    ? "border-primary bg-primary-bg text-primary"
                    : "border-border bg-transparent text-text"
                  }
                `}
              >
                {opt.swatch && (
                  <span
                    className="w-4 h-4 rounded border border-black/10 shrink-0"
                    style={{ background: opt.swatch }}
                  />
                )}
                {opt.label}
              </button>
            );
          })}
        </div>
        {recolor === "custom" && (
          <div className="flex items-center gap-2.5 mt-3">
            <input
              type="color"
              value={customHex}
              onChange={(e) => {
                setCustomHex(e.target.value);
                onUpdate(tolerance, "custom", e.target.value);
              }}
              className="w-9 h-9 border-2 border-border rounded-lg bg-white cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={customHex}
              onChange={(e) => {
                setCustomHex(e.target.value);
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                  onUpdate(tolerance, "custom", e.target.value);
                }
              }}
              className="w-[100px] bg-white border border-border rounded-lg text-text text-[13px] font-semibold px-3 py-2 outline-none focus:border-border-focus"
            />
            <span
              className="w-6 h-6 rounded-md border border-black/10"
              style={{ background: customHex }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
