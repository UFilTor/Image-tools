"use client";

import { LOGO_RECOLOR_PRESETS } from "@/lib/constants";

interface LogoControlsProps {
  isTransparent: boolean;
  removeBgEnabled: boolean;
  setRemoveBgEnabled: (v: boolean) => void;
  recolor: string;
  setRecolor: (v: string) => void;
  customHex: string;
  setCustomHex: (v: string) => void;
  onUpdate: (removeBgEnabled: boolean, recolor: string, customHex: string) => void;
}

export function LogoControls({
  isTransparent, removeBgEnabled, setRemoveBgEnabled, recolor, setRecolor, customHex, setCustomHex, onUpdate,
}: LogoControlsProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-5">
      {/* Background removal section */}
      <div>
        <div className="text-[13px] font-semibold text-text mb-2.5">Background removal</div>
        {isTransparent ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#e8f5e9] text-[#2e7d32] text-[13px] font-medium">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.94 10.56 4.4 8.02l.94-.94 1.6 1.6 3.72-3.72.94.94-4.66 4.66Z" fill="currentColor"/>
            </svg>
            Transparent background detected
          </div>
        ) : (
          <button
            onClick={() => {
              const next = !removeBgEnabled;
              setRemoveBgEnabled(next);
              onUpdate(next, recolor, customHex);
            }}
            className="flex items-center gap-0 rounded-lg overflow-hidden border border-border text-[13px] font-semibold"
          >
            <span
              className={`px-4 py-2 transition-all duration-150 ${
                removeBgEnabled
                  ? "bg-primary text-white"
                  : "bg-transparent text-text-muted"
              }`}
            >
              On
            </span>
            <span
              className={`px-4 py-2 transition-all duration-150 ${
                !removeBgEnabled
                  ? "bg-primary text-white"
                  : "bg-transparent text-text-muted"
              }`}
            >
              Off
            </span>
          </button>
        )}
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
                  onUpdate(removeBgEnabled, opt.key, customHex);
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
                onUpdate(removeBgEnabled, "custom", e.target.value);
              }}
              className="w-9 h-9 border-2 border-border rounded-lg bg-white cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={customHex}
              onChange={(e) => {
                let v = e.target.value;
                // Auto-add # prefix if user types a valid hex without it
                if (/^[0-9a-fA-F]{6}$/.test(v)) {
                  v = `#${v}`;
                }
                setCustomHex(v);
                if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                  onUpdate(removeBgEnabled, "custom", v);
                }
              }}
              placeholder="#000000"
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
