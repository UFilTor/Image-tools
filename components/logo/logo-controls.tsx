"use client";

import { ReactNode } from "react";
import { LOGO_RECOLOR_PRESETS } from "@/lib/constants";
import { HEX_RE } from "@/lib/logo-edits";
import { canFillBackground } from "@/lib/logo-processing";
import type { BgMode } from "@/hooks/use-logo-processor";

const BG_MODES: { key: BgMode; label: string }[] = [
  { key: "off", label: "Off" },
  { key: "color", label: "Solid color" },
  { key: "ai", label: "AI" },
];

interface LogoControlsProps {
  isTransparent: boolean;
  bgMode: BgMode;
  setBgMode: (v: BgMode) => void;
  bgStatus: { busy: boolean; pct: number | null; error: string | null };
  /** Nothing visible is left after background removal (usually a one-color logo) */
  emptyResult: boolean;
  recolor: string;
  setRecolor: (v: string) => void;
  customHex: string;
  setCustomHex: (v: string) => void;
  /** Background fill color, or null */
  bgFill: string | null;
  setBgFill: (v: string | null) => void;
  /** Section rendered between background removal and recolor (the color-change list). */
  children?: ReactNode;
}

export function LogoControls({
  isTransparent, bgMode, setBgMode, bgStatus, emptyResult, recolor, setRecolor, customHex, setCustomHex,
  bgFill, setBgFill, children,
}: LogoControlsProps) {
  // A fill only shows behind transparent areas; on an opaque logo the background is just a color
  // in Changes.
  const canFill = canFillBackground(isTransparent, bgMode !== "off");

  return (
    <div className="bg-surface border border-border rounded-2xl px-[22px] py-5 flex flex-col gap-[18px]">
      {/* Background removal section */}
      <div>
        <div className="text-[13px] font-semibold text-text mb-2.5">Background</div>
        {isTransparent ? (
          <div className="inline-flex items-center gap-2 bg-lichen text-primary text-[13px] font-medium px-3 py-2 rounded-lg">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.94 10.56 4.4 8.02l.94-.94 1.6 1.6 3.72-3.72.94.94-4.66 4.66Z" fill="currentColor"/>
            </svg>
            Transparent background detected
          </div>
        ) : (
          <>
            <div
              role="group"
              aria-label="Background removal"
              className="inline-flex border border-border rounded-button overflow-hidden text-[13px] font-semibold"
            >
              {BG_MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={bgMode === m.key}
                  onClick={() => setBgMode(m.key)}
                  className={`px-4 py-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                    bgMode === m.key
                      ? "bg-primary text-accent"
                      : "bg-transparent text-text-muted hover:text-primary"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {bgMode === "ai" && (
              <p className="text-xs text-text-secondary mt-2" role="status">
                {bgStatus.busy
                  ? bgStatus.pct !== null && bgStatus.pct < 100
                    ? `Downloading the AI model… ${Math.round(bgStatus.pct)}%`
                    : "Removing the background…"
                  : "Best for photos and busy backgrounds. The first run downloads a 44 MB model."}
              </p>
            )}
            {bgStatus.error && (
              <p className="text-xs text-error font-medium mt-2" role="alert">{bgStatus.error}</p>
            )}
            {emptyResult && !bgStatus.busy && (
              <p className="text-xs text-error font-medium mt-2" role="alert">
                Nothing is left after removing the background. This logo seems to be one color. Choose Off.
              </p>
            )}
          </>
        )}
        {canFill && (
          <div className="flex items-center gap-2.5 mt-3 min-h-9">
            <label className="flex items-center gap-2 cursor-pointer text-[13px] font-medium text-text">
              <input
                type="checkbox"
                checked={bgFill !== null}
                onChange={(e) => setBgFill(e.target.checked ? "#FFFFFF" : null)}
                className="w-4 h-4 accent-primary cursor-pointer"
              />
              Fill the background with a color
            </label>
            {bgFill !== null && (
              <input
                type="color"
                value={bgFill.toLowerCase()}
                onChange={(e) => setBgFill(e.target.value.toUpperCase())}
                aria-label="Background fill color"
                className="w-9 h-9 border-2 border-border rounded-button bg-surface cursor-pointer p-0.5"
              />
            )}
          </div>
        )}
      </div>

      {children && (
        <>
          <div className="h-px bg-border" />
          {children}
        </>
      )}

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
                onClick={() => setRecolor(opt.key)}
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
              onChange={(e) => setCustomHex(e.target.value)}
              className="w-9 h-9 border-2 border-border rounded-button bg-surface cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={customHex}
              onChange={(e) => {
                const v = e.target.value;
                setCustomHex(/^[0-9a-fA-F]{6}$/.test(v) ? `#${v}` : v);
              }}
              placeholder="#000000"
              aria-invalid={!HEX_RE.test(customHex)}
              className="w-[110px] bg-surface border border-border rounded-button text-text text-[13px] font-semibold px-3 py-2 outline-none focus:border-border-focus"
            />
          </div>
        )}
        {recolor === "custom" && !HEX_RE.test(customHex) && (
          <p className="text-xs text-text-secondary mt-2">Use a 6-digit hex like #022C12. The last valid color stays until then.</p>
        )}
      </div>
    </div>
  );
}
