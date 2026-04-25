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
    <div className="bg-surface border border-border rounded-2xl px-[22px] py-5 flex flex-col gap-[18px]">
      {/* Background removal section */}
      <div>
        <div className="text-[13px] font-semibold text-text mb-2.5">Background removal</div>
        {isTransparent ? (
          <div className="inline-flex items-center gap-2 bg-lichen text-primary text-[13px] font-medium px-3 py-2 rounded-lg">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.94 10.56 4.4 8.02l.94-.94 1.6 1.6 3.72-3.72.94.94-4.66 4.66Z" fill="currentColor"/>
            </svg>
            Transparent background detected
          </div>
        ) : (
          <div
            role="group"
            className="inline-flex border border-border rounded-button overflow-hidden text-[13px] font-semibold"
          >
            <button
              type="button"
              onClick={() => {
                setRemoveBgEnabled(true);
                onUpdate(true, recolor, customHex);
              }}
              className={`px-4 py-2 transition-all duration-150 ${
                removeBgEnabled
                  ? "bg-primary text-accent"
                  : "bg-transparent text-text-muted hover:text-primary"
              }`}
            >
              On
            </button>
            <button
              type="button"
              onClick={() => {
                setRemoveBgEnabled(false);
                onUpdate(false, recolor, customHex);
              }}
              className={`px-4 py-2 transition-all duration-150 ${
                !removeBgEnabled
                  ? "bg-primary text-accent"
                  : "bg-transparent text-text-muted hover:text-primary"
              }`}
            >
              Off
            </button>
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* Recolor options */}
      <div>
        <div className="text-[13px] font-semibold text-text mb-2.5">Recolor</div>
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
                  inline-flex items-center gap-2 px-[14px] py-2 rounded-button cursor-pointer
                  border-[1.5px] text-[13px] font-semibold transition-all duration-150
                  ${active
                    ? "border-primary bg-primary-bg text-primary"
                    : "border-border bg-transparent text-text hover:border-border-hover"
                  }
                `}
              >
                {opt.swatch && (
                  <span
                    className="w-4 h-4 rounded shrink-0"
                    style={{ background: opt.swatch, border: "1px solid rgba(0,0,0,0.18)" }}
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
              className="w-9 h-9 border-2 border-border rounded-button bg-surface cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={customHex}
              onChange={(e) => {
                let v = e.target.value;
                if (/^[0-9a-fA-F]{6}$/.test(v)) {
                  v = `#${v}`;
                }
                setCustomHex(v);
                if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                  onUpdate(removeBgEnabled, "custom", v);
                }
              }}
              placeholder="#000000"
              className="w-[110px] bg-surface border border-border rounded-button text-text text-[13px] font-semibold px-3 py-2 outline-none focus:border-border-focus"
            />
          </div>
        )}
      </div>
    </div>
  );
}
