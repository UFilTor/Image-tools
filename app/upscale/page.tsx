"use client";

import { useUpscale } from "@/hooks/use-upscale";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useClipboardPaste } from "@/hooks/use-clipboard-paste";
import { useConfirm } from "@/hooks/use-confirm";
import { DropZone } from "@/components/ui/drop-zone";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Badge } from "@/components/ui/badge";
import { dlDataUrl, dlAllUpscaled } from "@/lib/download";
import { upscaleFilename } from "@/lib/upscale";
import { UpscaleFactor } from "@/lib/types";
import { DlIcon, RetryIcon } from "@/components/icons";

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

  useKeyboardShortcuts({
    onEscape: step === "processing" ? resetConfirm.fire : undefined,
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
              Enlarge low-resolution images with AI, right in your browser. Pick a scale, then drop images.
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
            Runs entirely in your browser — nothing is uploaded. The AI model loads on first use,
            so the first image takes a little longer. Very small or heavily compressed images improve only modestly.
          </p>
        </div>
      </div>
    );
  }

  /* -- Processing / results grid -- */
  return (
    <div className="w-full max-w-[1200px]">
      <div className="animate-fadeUp">
        {/* Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-display uppercase font-bold text-[18px] text-primary tracking-[0.02em]">Results</span>
            <Badge>{scale}×</Badge>
            {modelLoading && processingCount > 0 && (
              <span className="text-xs text-text-muted animate-pulse">Loading AI model…</span>
            )}
            {!modelLoading && processingCount > 0 && (
              <span className="text-xs text-text-muted">
                Upscaling {processingCount} image{processingCount !== 1 ? "s" : ""}…
              </span>
            )}
          </div>
          <div className="sm:flex-1" />
          <div className="flex items-center gap-2 flex-wrap">
            <ScaleToggle scale={scale} onChange={changeScale} />
            <ConfirmButton
              size="sm"
              armed={resetConfirm.armed}
              onFire={resetConfirm.fire}
              confirmLabel={`Clear ${items.length} image${items.length === 1 ? "" : "s"}?`}
            >
              New batch
            </ConfirmButton>
            <Button size="sm" variant="primary" onClick={() => dlAllUpscaled(items, scale)} disabled={doneCount === 0}>
              <DlIcon /> Download all
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {items.map((item, idx) => (
            <div
              key={idx}
              className="bg-surface border border-border rounded-xl overflow-hidden transition-all duration-150 hover:border-border-hover"
            >
              {/* Image preview */}
              <div className="relative aspect-[4/3] overflow-hidden bg-surface-alt flex items-center justify-center">
                <img
                  src={item.result || item.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                />

                {/* Queued / processing overlay */}
                {(item.status === "queued" || item.status === "processing") && (
                  <div
                    role="status"
                    aria-label={item.status === "queued" ? "Queued" : "Upscaling image"}
                    className="absolute inset-0 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2"
                    style={{ background: "var(--overlay-analyzing)" }}
                  >
                    <div
                      className="w-[30px] h-[30px] rounded-full animate-spin"
                      style={{ border: "3px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }}
                    />
                    <span className="text-[12px] text-white font-semibold tabular-nums">
                      {item.status === "queued" ? "Queued" : `${item.progress}%`}
                    </span>
                  </div>
                )}

                {/* Error overlay */}
                {item.status === "error" && (
                  <div
                    className="absolute inset-0 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 px-3 text-center"
                    style={{ background: "var(--overlay-error)" }}
                    title={item.error || "Upscaling failed"}
                  >
                    <span className="text-[12px] text-white font-semibold leading-snug">
                      Couldn&apos;t upscale this one
                    </span>
                    <Button size="sm" variant="danger" onClick={() => retryItem(idx)}>
                      <RetryIcon /> Retry
                    </Button>
                  </div>
                )}
              </div>

              {/* Bottom section */}
              <div className="p-3">
                <p className="text-xs font-medium text-text truncate mb-1.5">{item.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-text-muted tabular-nums">
                    {item.status === "done" && item.resultNatural
                      ? `${item.natural.w}×${item.natural.h} → ${item.resultNatural.w}×${item.resultNatural.h}`
                      : `${item.natural.w}×${item.natural.h}`}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {item.status === "done" && item.result && (
                      <Button
                        size="sm"
                        variant="primary"
                        aria-label={`Download ${item.name}`}
                        onClick={() => dlDataUrl(item.result!, upscaleFilename(item.name, scale))}
                      >
                        <DlIcon />
                      </Button>
                    )}
                    {item.status === "error" && (
                      <Button size="sm" onClick={() => retryItem(idx)}>
                        <RetryIcon /> Retry
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
