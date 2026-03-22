"use client";

import { useSingleCrop } from "@/hooks/use-single-crop";
import { useCropDrag } from "@/hooks/use-crop-drag";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useClipboardPaste } from "@/hooks/use-clipboard-paste";
import { RatioDropZones } from "@/components/crop/ratio-drop-zones";
import { RatioPicker } from "@/components/crop/ratio-picker";
import { ZoomableEditor } from "@/components/crop/zoomable-editor";
import { ImageFilmstrip } from "@/components/crop/image-filmstrip";
import { Button } from "@/components/ui/button";
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
    loadImage, loadWithRatio, pickRatio, navigateTo, goToRatio, reset,
  } = useSingleCrop();
  const { startDrag } = useCropDrag();
  useClipboardPaste(step === "upload" ? loadImage : null);

  useKeyboardShortcuts({
    onEnter: step === "crop" && src ? () => dlCrop(src, nat, disp, crop, cropFilename(name)) : undefined,
    onEscape: step === "crop"
      ? (isMulti ? reset : goToRatio)
      : step === "ratio" ? reset : undefined,
    onLeft: isMulti && step === "crop" ? () => navigateTo(currentIdx - 1) : undefined,
    onRight: isMulti && step === "crop" ? () => navigateTo(currentIdx + 1) : undefined,
    disableModeNav: step === "ratio",
  });

  return (
    <div className="w-full max-w-[1200px]">
      {step === "upload" && (
        <div className="max-w-[520px] w-full mx-auto mt-16 animate-fadeUp">
          <div className="text-center mb-8">
            <h1 className="text-[28px] font-bold mb-2 tracking-tight">Crop</h1>
            <p className="text-[15px] text-text-muted leading-relaxed">
              Drop images onto a ratio to start cropping.
            </p>
          </div>
          <RatioDropZones onDropWithRatio={loadWithRatio} />
        </div>
      )}

      {step === "ratio" && (
        <div className="mt-16 mx-auto">
          <RatioPicker subtitle="Step 1 of 2" onPick={pickRatio} onBack={reset} />
        </div>
      )}

      {step === "crop" && src && (
        <div className="flex flex-col items-center gap-4 animate-fadeUp">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-lg font-bold tracking-tight">Edit crop</span>
            <Badge>{ratioLabel}</Badge>
            {isMulti && (
              <span className="text-sm text-text-muted font-medium">
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
              <Button size="sm" onClick={() => navigateTo(currentIdx - 1)} disabled={currentIdx === 0}>
                &larr; Prev
              </Button>
              <ImageFilmstrip items={queue} currentIdx={currentIdx} onSelect={navigateTo} />
              <Button size="sm" onClick={() => navigateTo(currentIdx + 1)} disabled={currentIdx === queue.length - 1}>
                Next &rarr;
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap justify-center mt-1">
            <Button onClick={goToRatio}>Change ratio</Button>
            <Button onClick={reset}>New images</Button>
            <Button variant="primary" onClick={() => dlCrop(src, nat, disp, crop, cropFilename(name))}>
              <DlIcon /> Download
            </Button>
            {isMulti && (
              <Button variant="primary" onClick={() => dlAllCropQueue(queue)}>
                <DlIcon /> Download all
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
