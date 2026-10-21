"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { checkerBg } from "@/lib/constants";

interface AiAssistProps {
  /** Claude edits ("Apply": colors, erasing parts, background); hidden when the API key is missing */
  claude: { available: boolean; busy: boolean; note: string | null; error: string | null };
  onChangeColors: (instruction: string) => void;
  /** Image-model redraw ("Redraw image"); hidden when the AI Gateway is not configured */
  redraw: {
    available: boolean;
    busy: boolean;
    error: string | null;
    candidate: { url: string; w: number; h: number } | null;
  };
  onRedraw: (instruction: string) => void;
  onAccept: () => void;
  onDiscard: () => void;
  /** Current source, shown next to a redraw candidate */
  currentSrc: string;
}

/**
 * One prompt, two actions. Enter runs "Apply" (Claude plans color edits and erases, under a cent);
 * "Redraw image" is the secondary, paid image-model action, so it never runs by accident. A
 * redraw result is only a candidate, shown next to the current logo until kept or discarded.
 */
export function AiAssist({ claude, onChangeColors, redraw, onRedraw, onAccept, onDiscard, currentSrc }: AiAssistProps) {
  const [text, setText] = useState("");
  const [emptyHint, setEmptyHint] = useState(false);
  const busy = claude.busy || redraw.busy;

  /** Run an action, or say why nothing happened when the field is empty. */
  const run = (action: (instruction: string) => void) => {
    if (busy) return;
    if (!text.trim()) {
      setEmptyHint(true);
      return;
    }
    action(text);
  };

  // Enter only runs the cheap Claude edit; the paid redraw always needs its own button click.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (claude.available) run(onChangeColors);
  };

  return (
    <form onSubmit={submit} className="bg-surface border border-border rounded-2xl px-[22px] py-5">
      <label htmlFor="logo-ai" className="block text-[13px] font-semibold text-text mb-2.5">
        Ask AI
      </label>
      <input
        id="logo-ai"
        name="instruction"
        type="text"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setEmptyHint(false);
        }}
        maxLength={300}
        placeholder="For example: make the text black…"
        disabled={busy}
        className="w-full min-h-11 bg-surface border border-border rounded-button text-text text-[16px] md:text-[14px] px-3 outline-none focus:border-border-focus disabled:opacity-60"
      />
      <div className="flex gap-2 mt-2 flex-wrap">
        {claude.available && (
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            {claude.busy ? "Working…" : "Apply"}
          </Button>
        )}
        {redraw.available && (
          <Button
            type="button"
            variant={claude.available ? "outline" : "primary"}
            size="sm"
            disabled={busy}
            onClick={() => run(onRedraw)}
          >
            {redraw.busy ? "Redrawing…" : "Redraw image · ~$0.04"}
          </Button>
        )}
      </div>

      <div aria-live="polite">
        {emptyHint && <p className="text-xs text-error font-medium mt-2">Type what to change first.</p>}
        {claude.busy && <p className="text-xs text-text-secondary mt-2">Claude is looking at your logo…</p>}
        {redraw.busy && <p className="text-xs text-text-secondary mt-2">The image model is working. This takes about 10-30 seconds.</p>}
        {!busy && claude.note && <p className="text-xs text-text mt-2">{claude.note}</p>}
        {!busy && (claude.error || redraw.error) && (
          <p className="text-xs text-error font-medium mt-2" role="alert">{claude.error || redraw.error}</p>
        )}
      </div>
      <p className="text-[11px] text-text-secondary mt-2">
        Apply changes colors, erases parts and removes or fills the background, and keeps every shape as it is. Redraw image
        redraws the whole logo, so check every letter.
      </p>

      {redraw.candidate && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Current", url: currentSrc },
              { label: `AI redraw · ${redraw.candidate.w} × ${redraw.candidate.h}px`, url: redraw.candidate.url },
            ].map((v) => (
              <figure key={v.label} className="m-0">
                <div
                  className="border border-border rounded-xl p-2 aspect-[4/3] flex items-center justify-center"
                  style={{ background: checkerBg() }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- object URLs, not optimizable */}
                  <img src={v.url} alt={v.label} className="max-w-full max-h-full object-contain" draggable={false} />
                </div>
                <figcaption className="text-[11px] text-text-secondary mt-1.5">{v.label}</figcaption>
              </figure>
            ))}
          </div>
          <div className="flex gap-2 mt-3 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
              Discard
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={onAccept}>
              Use AI version
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
