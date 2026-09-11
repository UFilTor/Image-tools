"use client";

import { useToolState } from "@/components/tool-state-provider";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useClipboardPaste } from "@/hooks/use-clipboard-paste";
import { useConfirm } from "@/hooks/use-confirm";
import { useDownload } from "@/hooks/use-download";
import { RatioDropZones } from "@/components/crop/ratio-drop-zones";
import { ImageFilmstrip } from "@/components/crop/image-filmstrip";
import { ExtendPreview } from "@/components/extend/extend-preview";
import { ExtendControls } from "@/components/extend/extend-controls";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Badge } from "@/components/ui/badge";
import { dlExtended, dlAllExtended } from "@/lib/download";
import { DlIcon } from "@/components/icons";

export default function ExtendPage() {
  const {
    step, queue, currentIdx, current,
    ratio, ratioLabel, setRatio,
    padding, setPadding,
    fillStyle, setFillStyle,
    fillColor, setFillColor,
    isMulti,
    loadImage, loadWithRatio, navigateTo, reset, reportLoadError,
  } = useToolState().extend;

  useClipboardPaste(step === "upload" ? loadImage : null, reportLoadError);
  const dl = useDownload();

  const resetConfirm = useConfirm({ onConfirm: reset, count: queue.length, threshold: 1 });

  const fill = { style: fillStyle, color: fillColor };
  const download = () => current && dl.run(() => dlExtended(current, ratio, padding, fill));

  useKeyboardShortcuts({
    onEnter: step === "edit" && current && !dl.busy ? download : undefined,
    onEscape: step === "edit" ? resetConfirm.fire : undefined,
    onLeft: isMulti && step === "edit" ? () => navigateTo(currentIdx - 1) : undefined,
    onRight: isMulti && step === "edit" ? () => navigateTo(currentIdx + 1) : undefined,
  });

  return (
    <div className="w-full max-w-[1200px]">
      {step === "upload" && (
        <div className="max-w-[662px] w-full mx-auto mt-16 animate-fadeUp">
          <div className="text-center mb-2">
            <h1 className="font-display uppercase font-bold text-[44px] text-primary leading-[0.95] tracking-[-0.005em] mb-2">
              Extend
            </h1>
            <p className="text-[15px] text-text-secondary leading-[1.5]">
              Add space around an image to center the subject. Drop onto a ratio to start.
            </p>
          </div>
          <RatioDropZones onDropWithRatio={loadWithRatio} />
        </div>
      )}

      {step === "edit" && current && (
        <div className="flex flex-col items-center gap-4 animate-fadeUp">
          <div className="flex items-center gap-2.5 mb-1 flex-wrap justify-center">
            <span className="font-display uppercase font-bold text-[18px] text-primary tracking-[0.02em]">Extend image</span>
            <Badge>{ratioLabel}</Badge>
            {isMulti && (
              <span className="text-[13px] text-text-muted font-medium tabular-nums">
                {currentIdx + 1} of {queue.length}
              </span>
            )}
          </div>

          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-5 w-full justify-center">
            <div className="flex-1 max-w-[720px] w-full">
              <ExtendPreview
                src={current.src}
                natural={current.natural}
                ratio={ratio}
                padding={padding}
                fillStyle={fillStyle}
                fillColor={fillColor}
              />
            </div>
            <ExtendControls
              ratio={ratio}
              ratioLabel={ratioLabel}
              setRatio={setRatio}
              padding={padding}
              setPadding={setPadding}
              fillStyle={fillStyle}
              setFillStyle={setFillStyle}
              fillColor={fillColor}
              setFillColor={setFillColor}
            />
          </div>

          {isMulti && (
            <div className="flex items-center gap-2">
              <Button size="sm" aria-label="Previous image" onClick={() => navigateTo(currentIdx - 1)} disabled={currentIdx === 0}>
                ← Prev
              </Button>
              <ImageFilmstrip items={queue} currentIdx={currentIdx} onSelect={navigateTo} />
              <Button size="sm" aria-label="Next image" onClick={() => navigateTo(currentIdx + 1)} disabled={currentIdx === queue.length - 1}>
                Next →
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap justify-center mt-1">
            <ConfirmButton
              armed={resetConfirm.armed}
              onFire={resetConfirm.fire}
              confirmLabel={`Clear ${queue.length} image${queue.length === 1 ? "" : "s"}?`}
            >
              New images
            </ConfirmButton>
            <Button variant="primary" onClick={download} disabled={dl.busy}>
              <DlIcon /> Download
            </Button>
            {isMulti && (
              <Button variant="primary" onClick={() => dl.run(() => dlAllExtended(queue, ratio, padding, fill))} disabled={dl.busy}>
                <DlIcon /> {dl.busy ? "Preparing…" : "Download all"}
              </Button>
            )}
          </div>
          {dl.error && <p className="text-sm text-error font-medium text-center" role="alert">{dl.error}</p>}
        </div>
      )}
    </div>
  );
}
