"use client";

import { useSingleCrop } from "@/hooks/use-single-crop";
import { useCropDrag } from "@/hooks/use-crop-drag";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useClipboardPaste } from "@/hooks/use-clipboard-paste";
import { DropZone } from "@/components/ui/drop-zone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SizeInput } from "@/components/ui/size-input";
import { RatioPicker } from "@/components/crop/ratio-picker";
import { ZoomableEditor } from "@/components/crop/zoomable-editor";
import { dlCrop } from "@/lib/download";
import { cropFilename } from "@/lib/image-utils";
import { DlIcon } from "@/components/icons";

export default function SinglePage() {
  const {
    step, src, name, nat, disp, ratio, ratioLabel,
    crop, setCrop, zoom, setZoom, pan, setPan,
    cropPx, cropPy, loadImage, pickRatio, goToRatio, reset,
  } = useSingleCrop();
  const { startDrag } = useCropDrag();
  useClipboardPaste(step === "upload" ? loadImage : null);

  useKeyboardShortcuts({
    onEnter: step === "crop" && src ? () => dlCrop(src, nat, disp, crop, cropFilename(name)) : undefined,
    onEscape: step === "crop" ? goToRatio : step === "ratio" ? reset : undefined,
    disableModeNav: step === "ratio", // RatioPicker handles 1-4 keys itself
  });

  return (
    <div className="w-full max-w-[1200px]">
      {step === "upload" && (
        <div className="max-w-[460px] w-full mx-auto mt-16 animate-fadeUp">
          <div className="text-center mb-8">
            <h1 className="text-[28px] font-bold mb-2 tracking-tight">Crop an image</h1>
            <p className="text-[15px] text-text-muted leading-relaxed">
              Upload, pick a ratio, download at full resolution.
            </p>
          </div>
          <DropZone onFiles={loadImage}>
            {(over) => (
              <>
                <div className="w-14 h-14 rounded-[14px] bg-primary-bg flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#022C12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
                <p className={`text-[15px] font-medium ${over ? "text-primary" : "text-text-secondary"}`}>
                  Drop image here or <span className="text-primary font-bold">browse</span>
                </p>
                <p className="text-xs mt-2 text-text-dim">PNG, JPG, or WebP</p>
              </>
            )}
          </DropZone>
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
            <span className="text-lg font-bold tracking-tight">Adjust crop</span>
            <Badge>{ratioLabel}</Badge>
            <SizeInput cropPx={cropPx} cropPy={cropPy} ratio={ratio} crop={crop} setCrop={setCrop} disp={disp} nat={nat} />
          </div>
          <ZoomableEditor
            src={src} disp={disp} crop={crop} setCrop={setCrop} ratio={ratio}
            onDown={(e, t) => startDrag(e, t, crop, setCrop, ratio, disp.dw, disp.dh, zoom)}
            zoom={zoom} setZoom={setZoom} pan={pan} setPan={setPan}
          />
          <div className="flex items-center gap-2 flex-wrap justify-center mt-1">
            <Button onClick={goToRatio}>Change ratio</Button>
            <Button onClick={reset}>New image</Button>
            <Button variant="primary" onClick={() => dlCrop(src, nat, disp, crop, cropFilename(name))}>
              <DlIcon /> Download
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
