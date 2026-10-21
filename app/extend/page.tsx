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
import { SafeZoneToggle } from "@/components/crop/safe-zone-toggle";
import { SecondaryCountSwitch } from "@/components/crop/secondary-count-switch";
import { dlExtended, dlAllExtended, extendedBlob } from "@/lib/download";
import { extendFilename } from "@/lib/extend-utils";
import { orderedName } from "@/lib/image-utils";
import { DlIcon } from "@/components/icons";
import { FromWebsite } from "@/components/ui/from-website";
import { LoadError } from "@/components/ui/load-error";
import { SendTo } from "@/components/ui/send-to";

export default function ExtendPage() {
  const {
    step, queue, currentIdx, current,
    ratio, ratioLabel, setRatio, batchRatio, isSet, setNote, loadExperienceSet, pickSet, makeMain,
    padding, setPadding,
    fillStyle, setFillStyle,
    fillColor, setFillColor,
    fitSafe, setFitSafe, safe,
    isMulti,
    loadImage, loadWithRatio, navigateTo, reset, reportLoadError, loadError,
  } = useToolState().extend;

  useClipboardPaste(step === "upload" ? loadImage : null, reportLoadError);
  const dl = useDownload();

  const resetConfirm = useConfirm({ onConfirm: reset, count: queue.length, threshold: 1 });

  const fill = { style: fillStyle, color: fillColor };
  const fileName = current ? orderedName(extendFilename(current.name), currentIdx, current.preset?.role) : "";
  const download = () => current && dl.run(() => dlExtended(current, ratio, padding, fill, safe, fileName));

  useKeyboardShortcuts({
    onEnter: step === "edit" && current && !dl.busy ? download : undefined,
    onEscape: step === "edit" ? resetConfirm.fire : undefined,
    onLeft: isMulti && step === "edit" ? () => navigateTo(currentIdx - 1) : undefined,
    onRight: isMulti && step === "edit" ? () => navigateTo(currentIdx + 1) : undefined,
  });

  return (
    <div className="w-full max-w-[1200px]">
      {step === "upload" && (
        <div className="max-w-[662px] w-full mx-auto mt-10 animate-fadeUp">
          <div className="text-center mb-2">
            <h1 className="font-display uppercase font-bold text-[44px] text-primary leading-[0.95] tracking-[-0.005em] mb-2">
              Extend
            </h1>
            <p className="text-[15px] text-text-secondary leading-[1.5]">
              Add space around an image to center the subject. Drop onto a ratio to start.
            </p>
          </div>
          <FromWebsite kind="photo" multiple onFiles={loadImage} onExperience={loadExperienceSet}>
            <RatioDropZones onDropWithRatio={loadWithRatio} onDropSet={loadExperienceSet} />
          </FromWebsite>
          <LoadError message={loadError} />
        </div>
      )}

      {step === "edit" && current && (
        <div className="flex flex-col items-center gap-4 animate-fadeUp">
          <div className="flex items-center gap-2.5 mb-1 flex-wrap justify-center">
            <span className="font-display uppercase font-bold text-[18px] text-primary tracking-[0.02em]">Extend image</span>
            <Badge>{ratioLabel}</Badge>
            {/* Full experience sets each photo's count from the set, so there's nothing to switch */}
            {!isSet && <SecondaryCountSwitch ratio={ratio} onChange={setRatio} />}
            {isMulti && (
              <span className="text-[13px] text-text-muted font-medium tabular-nums">
                {currentIdx + 1} of {queue.length}
              </span>
            )}
            <SafeZoneToggle ratio={ratio} />
          </div>
          {setNote && <p className="text-xs text-text-secondary text-center -mt-2" role="status">{setNote}</p>}

          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-5 w-full justify-center">
            <div className="flex-1 max-w-[720px] w-full">
              <ExtendPreview
                src={current.src}
                natural={current.natural}
                ratio={ratio}
                padding={padding}
                fillStyle={fillStyle}
                fillColor={fillColor}
                safe={safe}
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
              fitSafe={fitSafe}
              setFitSafe={setFitSafe}
              isSet={isSet}
              onPickSet={pickSet}
            />
          </div>

          {isMulti && (
            <div className="flex items-center gap-2">
              <Button size="sm" aria-label="Previous image" onClick={() => navigateTo(currentIdx - 1)} disabled={currentIdx === 0}>
                ← Prev
              </Button>
              <ImageFilmstrip
                items={queue.map((q) => ({ src: q.src, adjusted: q.adjusted, tag: q.preset?.role === "main" ? "Main" : undefined }))}
                currentIdx={currentIdx}
                onSelect={navigateTo}
              />
              <Button size="sm" aria-label="Next image" onClick={() => navigateTo(currentIdx + 1)} disabled={currentIdx === queue.length - 1}>
                Next →
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap justify-center mt-1">
            {current.preset?.role === "secondary" && <Button onClick={makeMain}>Make main photo</Button>}
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
              <Button variant="primary" onClick={() => dl.run(() => dlAllExtended(queue, batchRatio, padding, fill, fitSafe))} disabled={dl.busy}>
                <DlIcon /> {dl.busy ? "Preparing…" : "Download all"}
              </Button>
            )}
            {current && (
              <SendTo
                from="extend"
                fileName={fileName}
                getBlob={() => extendedBlob(current, ratio, padding, fill, safe)}
                disabled={dl.busy}
              />
            )}
          </div>
          {dl.error && <p className="text-sm text-error font-medium text-center" role="alert">{dl.error}</p>}
        </div>
      )}
    </div>
  );
}
