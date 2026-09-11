"use client";

import { useToolState } from "@/components/tool-state-provider";
import { useCropDrag } from "@/hooks/use-crop-drag";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useClipboardPaste } from "@/hooks/use-clipboard-paste";
import { useConfirm } from "@/hooks/use-confirm";
import { useDownload } from "@/hooks/use-download";
import { RatioDropZones } from "@/components/crop/ratio-drop-zones";
import { RatioPicker } from "@/components/crop/ratio-picker";
import { ZoomableEditor } from "@/components/crop/zoomable-editor";
import { ImageFilmstrip } from "@/components/crop/image-filmstrip";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Badge } from "@/components/ui/badge";
import { SizeInput } from "@/components/ui/size-input";
import { dlCrop, dlAllCropQueue } from "@/lib/download";
import { cropFilename } from "@/lib/image-utils";
import { DlIcon } from "@/components/icons";

export default function CropPage() {
  const {
    step, queue, currentIdx, current, ratio, ratioLabel,
    crop, setCrop, src, name, nat, disp,
    zoom, setZoom, pan, setPan,
    cropPx, cropPy, isMulti,
    loadImage, loadWithRatio, pickRatio, navigateTo, goToRatio, reset, reportLoadError,
  } = useToolState().crop;
  const { startDrag } = useCropDrag();
  useClipboardPaste(step === "upload" ? loadImage : null, reportLoadError);
  const dl = useDownload();
  const downloadCurrent = () => src && dl.run(() => dlCrop(src, nat, disp, crop, cropFilename(name)));

  const resetConfirm = useConfirm({ onConfirm: reset, count: queue.length, threshold: 1 });

  useKeyboardShortcuts({
    onEnter: step === "crop" && src && !dl.busy ? downloadCurrent : undefined,
    onEscape: step === "crop"
      ? (isMulti ? resetConfirm.fire : goToRatio)
      : step === "ratio" ? resetConfirm.fire : undefined,
    onLeft: isMulti && step === "crop" ? () => navigateTo(currentIdx - 1) : undefined,
    onRight: isMulti && step === "crop" ? () => navigateTo(currentIdx + 1) : undefined,
    disableModeNav: step === "ratio",
  });

  return (
    <div className="w-full max-w-[1200px]">
      {step === "upload" && (
        <div className="max-w-[662px] w-full mx-auto mt-16 animate-fadeUp">
          <div className="text-center mb-2">
            <h1 className="font-display uppercase font-bold text-[44px] text-primary leading-[0.95] tracking-[-0.005em] mb-2">
              Crop
            </h1>
            <p className="text-[15px] text-text-secondary leading-[1.5]">
              Drop images onto a ratio to start cropping.
            </p>
          </div>
          <RatioDropZones onDropWithRatio={loadWithRatio} />
        </div>
      )}

      {step === "ratio" && (
        <div className="mt-16 mx-auto">
          <RatioPicker
            subtitle="Step 1 of 2"
            onPick={pickRatio}
            onBack={resetConfirm.fire}
            backLabel={resetConfirm.armed ? `Press again to clear ${queue.length} image${queue.length === 1 ? "" : "s"}` : "← Go back"}
          />
        </div>
      )}

      {step === "crop" && src && (
        <div className="flex flex-col items-center gap-4 animate-fadeUp">
          <div className="flex items-center gap-2.5 mb-1 flex-wrap justify-center">
            <span className="font-display uppercase font-bold text-[18px] text-primary tracking-[0.02em]">Edit crop</span>
            <Badge>{ratioLabel}</Badge>
            {isMulti && (
              <span className="text-[13px] text-text-muted font-medium tabular-nums">
                {currentIdx + 1} of {queue.length}
              </span>
            )}
            <SizeInput cropPx={cropPx} cropPy={cropPy} ratio={ratio} crop={crop} setCrop={setCrop} disp={disp} nat={nat} />
          </div>
          <ZoomableEditor
            src={src} disp={disp} crop={crop} setCrop={setCrop} ratio={ratio}
            onDown={(e, t) => startDrag(e, t, crop, setCrop, ratio, disp.dw, disp.dh, zoom)}
            zoom={zoom} setZoom={setZoom} pan={pan} setPan={setPan}
          />
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
            <Button onClick={goToRatio}>Change ratio</Button>
            <ConfirmButton
              armed={resetConfirm.armed}
              onFire={resetConfirm.fire}
              confirmLabel={`Clear ${queue.length} image${queue.length === 1 ? "" : "s"}?`}
            >
              New images
            </ConfirmButton>
            <Button variant="primary" onClick={downloadCurrent} disabled={dl.busy}>
              <DlIcon /> Download
            </Button>
            {isMulti && (
              <Button variant="primary" onClick={() => dl.run(() => dlAllCropQueue(queue))} disabled={dl.busy}>
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
