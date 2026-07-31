"use client";

import { useState } from "react";
import { useUpscale } from "@/hooks/use-upscale";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useClipboardPaste } from "@/hooks/use-clipboard-paste";
import { useConfirm } from "@/hooks/use-confirm";
import { DropZone } from "@/components/ui/drop-zone";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Badge } from "@/components/ui/badge";
import { ImageFilmstrip } from "@/components/crop/image-filmstrip";
import { dlDataUrl, dlAllUpscaled } from "@/lib/download";
import { upscaleFilename } from "@/lib/upscale";
import { UpscaleFactor } from "@/lib/types";
import { DlIcon, RetryIcon } from "@/components/icons";
import { CompareSlider } from "@/components/upscale/compare-slider";

type ZoomMode = "full" | "fit";

function ScaleToggle({ scale, onChange }: { scale: UpscaleFactor; onChange: (s: UpscaleFactor) => void }) {
  return (
    <div className="inline-flex bg-surface rounded-lg border-[1.5px] border-border p-[3px] gap-0.5">
      {([2, 4] as UpscaleFactor[]).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          aria-pressed={scale === s}
          className={`
            px-3.5 py-1.5 rounded-md text-[13px] font-semibold tracking-[0.01em]
            transition-[background-color,color] duration-150
            ${scale === s ? "bg-primary text-accent" : "bg-transparent text-text-muted hover:text-primary"}
          `}
        >
          {s}×
        </button>
      ))}
    </div>
  );
}

export default function UpscalePage() {
  const {
    step, items, scale, modelLoading, doneCount, processingCount,
    loadAndUpscale, changeScale, retryItem, reset,
  } = useUpscale();

  useClipboardPaste(step === "upload" ? loadAndUpscale : null);
  const resetConfirm = useConfirm({ onConfirm: reset, count: items.length, threshold: 1 });
  const [currentIdx, setCurrentIdx] = useState(0);
  const [zoom, setZoom] = useState<ZoomMode>("full");

  // Keep the index valid when the batch shrinks or resets (convergent adjust-during-render).
  if (currentIdx !== 0 && currentIdx >= items.length) setCurrentIdx(0);

  const current = items[currentIdx] || null;
  const isMulti = items.length > 1;
  const isDone = current?.status === "done" && !!current.result;

  const navigateTo = (idx: number) => {
    if (idx < 0 || idx >= items.length) return;
    setCurrentIdx(idx);
  };

  const downloadCurrent = () => {
    if (current?.status === "done" && current.result) {
      dlDataUrl(current.result, upscaleFilename(current.name, scale, current.mode));
    }
  };

  useKeyboardShortcuts({
    onEnter: step === "processing" && isDone ? downloadCurrent : undefined,
    onEscape: step === "processing" ? resetConfirm.fire : undefined,
    onLeft: isMulti && step === "processing" ? () => navigateTo(currentIdx - 1) : undefined,
    onRight: isMulti && step === "processing" ? () => navigateTo(currentIdx + 1) : undefined,
  });

  /* -- Upload step -- */
  if (step === "upload") {
    return (
      <div className="w-full max-w-[1200px]">
        <div className="max-w-[662px] w-full mx-auto mt-16 animate-fadeUp">
          <div className="text-center mb-2">
            <h1 className="font-display uppercase font-bold text-[44px] text-primary leading-[0.95] tracking-[-0.005em] mb-2">
              Upscale
            </h1>
            <p className="text-[15px] text-text-secondary leading-[1.5]">
              Improve images with AI, right in your browser. Small images get upscaled,
              large ones get enhanced automatically.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2.5 my-5">
            <span className="text-[13px] text-text-muted font-medium">Scale</span>
            <ScaleToggle scale={scale} onChange={changeScale} />
          </div>

          <DropZone onFiles={loadAndUpscale} multiple>
            {() => (
              <>
                <div className="text-[15px] font-semibold text-primary mb-1">
                  Drop images to upscale {scale}×
                </div>
                <div className="text-[13px] text-text-muted">
                  or click to browse — PNG, JPG, WebP, AVIF, HEIC, SVG
                </div>
              </>
            )}
          </DropZone>

          <p className="text-[12px] text-text-dim text-center mt-4 leading-[1.5]">
            Runs entirely in your browser — nothing is uploaded. Images under 1000px are upscaled
            {" "}{scale}× (more pixels + sharper edges); larger images keep their size and get an
            AI enhancement pass instead. The model loads on first use, so the first image takes a little longer.
          </p>
        </div>
      </div>
    );
  }

  /* -- Compare / edit view (mirrors Crop's batch edit layout) -- */
  return (
    <div className="w-full max-w-[1200px]">
      <div className="flex flex-col items-center gap-4 animate-fadeUp">
        {/* Header row */}
        <div className="flex items-center gap-2.5 mb-1 flex-wrap justify-center">
          <span className="font-display uppercase font-bold text-[18px] text-primary tracking-[0.02em]">Compare</span>
          <Badge>{current?.mode === "enhance" ? "Enhance" : `${scale}×`}</Badge>
          {isMulti && (
            <span className="text-[13px] text-text-muted font-medium tabular-nums">
              {currentIdx + 1} of {items.length}
            </span>
          )}
          {current && (
            <span className="text-[13px] text-text-muted tabular-nums">
              {current.status === "done" && current.resultNatural
                ? `${current.natural.w}×${current.natural.h} → ${current.resultNatural.w}×${current.resultNatural.h}`
                : `${current.natural.w}×${current.natural.h}`}
            </span>
          )}
          {isDone && (
            <div
              role="group"
              aria-label="Zoom level"
              className="inline-flex border border-border rounded-button overflow-hidden text-[12px] font-semibold"
            >
              {([["full", "100%"], ["fit", "Fit"]] as [ZoomMode, string][]).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setZoom(mode)}
                  aria-pressed={zoom === mode}
                  className={`px-3 py-1.5 transition-colors duration-150 ${
                    zoom === mode ? "bg-primary text-accent" : "bg-transparent text-text-muted hover:text-primary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {modelLoading && processingCount > 0 && (
            <span className="text-xs text-text-muted animate-pulse">Loading AI model…</span>
          )}
        </div>

        {/* Stage */}
        {current && (
          <div className="relative w-full max-w-[1000px] rounded-xl overflow-hidden border border-border bg-surface-alt">
            {isDone ? (
              zoom === "full" && current.resultNatural ? (
                <div
                  className="overflow-auto"
                  style={{ height: "min(62vh, 720px)" }}
                  ref={(el) => {
                    // center the pan position when the element mounts for this item/zoom
                    if (el && el.dataset.centered !== `${currentIdx}`) {
                      el.dataset.centered = `${currentIdx}`;
                      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
                      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
                    }
                  }}
                >
                  <div
                    className="relative mx-auto"
                    style={{ width: current.resultNatural.w, height: current.resultNatural.h }}
                  >
                    <CompareSlider before={current.src} after={current.result!} alt={current.name} afterLabel={current.mode === "enhance" ? "Enhanced" : "Upscaled"} />
                  </div>
                </div>
              ) : (
                <div className="relative" style={{ height: "min(62vh, 720px)" }}>
                  <CompareSlider before={current.src} after={current.result!} alt={current.name} afterLabel={current.mode === "enhance" ? "Enhanced" : "Upscaled"} />
                </div>
              )
            ) : (
              <div className="relative flex items-center justify-center" style={{ height: "min(62vh, 720px)" }}>
                <img
                  src={current.src}
                  alt={current.name}
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                />
                {(current.status === "queued" || current.status === "processing") && (
                  <div
                    role="status"
                    aria-label={current.status === "queued" ? "Queued" : "Upscaling image"}
                    className="absolute inset-0 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2"
                    style={{ background: "var(--overlay-analyzing)" }}
                  >
                    <div
                      className="w-[30px] h-[30px] rounded-full animate-spin"
                      style={{ border: "3px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }}
                    />
                    <span className="text-[12px] text-white font-semibold tabular-nums">
                      {current.status === "queued" ? "Queued" : `${current.progress}%`}
                    </span>
                  </div>
                )}
                {current.status === "error" && (
                  <div
                    className="absolute inset-0 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 px-3 text-center"
                    style={{ background: "var(--overlay-error)" }}
                  >
                    <span className="text-[13px] text-white font-semibold leading-snug">
                      {current.error || "Couldn't upscale this one"}
                    </span>
                    <Button size="sm" variant="danger" onClick={() => retryItem(currentIdx)}>
                      <RetryIcon /> Retry
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Filmstrip */}
        {isMulti && (
          <div className="flex items-center gap-2">
            <Button size="sm" aria-label="Previous image" onClick={() => navigateTo(currentIdx - 1)} disabled={currentIdx === 0}>
              ← Prev
            </Button>
            <ImageFilmstrip items={items} currentIdx={currentIdx} onSelect={navigateTo} />
            <Button size="sm" aria-label="Next image" onClick={() => navigateTo(currentIdx + 1)} disabled={currentIdx === items.length - 1}>
              Next →
            </Button>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap justify-center mt-1">
          <ScaleToggle scale={scale} onChange={changeScale} />
          <ConfirmButton
            armed={resetConfirm.armed}
            onFire={resetConfirm.fire}
            confirmLabel={`Clear ${items.length} image${items.length === 1 ? "" : "s"}?`}
          >
            New batch
          </ConfirmButton>
          <Button variant="primary" onClick={downloadCurrent} disabled={!isDone}>
            <DlIcon /> Download
          </Button>
          {isMulti && (
            <Button variant="primary" onClick={() => dlAllUpscaled(items, scale)} disabled={doneCount === 0}>
              <DlIcon /> Download all
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
