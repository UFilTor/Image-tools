"use client";

import { useState } from "react";
import { useMultiCrop } from "@/hooks/use-multi-crop";
import { useCropDrag } from "@/hooks/use-crop-drag";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useClipboardPaste } from "@/hooks/use-clipboard-paste";
import { RatioDropZones } from "@/components/crop/ratio-drop-zones";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SizeInput } from "@/components/ui/size-input";
import { RatioPicker } from "@/components/crop/ratio-picker";
import { ZoomableEditor } from "@/components/crop/zoomable-editor";
import { ImageFilmstrip } from "@/components/crop/image-filmstrip";
import { dlCrop, dlAll } from "@/lib/download";
import { cropFilename } from "@/lib/image-utils";
import { DlIcon, RetryIcon, GripIcon, RatioIcon } from "@/components/icons";

export default function SmartCropPage() {
  const {
    step, setStep, items, ratio, ratioLabel,
    editIdx, editItem, editCrop, setEditCrop,
    editCropPx, editCropPy,
    zoom, setZoom, pan, setPan,
    doneCount, errCount, analyzingCount,
    loadImages, loadAndAnalyzeWithRatio, startAnalysis, batchRecrop, retryItem,
    reorderItems, openEdit, saveAndCloseEdit, navigateEdit, reset,
  } = useMultiCrop();
  const { startDrag } = useCropDrag();
  useClipboardPaste(step === "upload" ? loadImages : null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const isEdit = editIdx !== null;

  useKeyboardShortcuts({
    disableModeNav: step === "ratio" || step === "recrop",
    onEnter: isEdit && editItem?.crop && editCrop
      ? () => dlCrop(editItem.src, editItem.natural, editItem.disp, editCrop, cropFilename(editItem.name))
      : undefined,
    onEscape: isEdit ? saveAndCloseEdit : step === "review" ? reset : undefined,
    onLeft: isEdit ? () => navigateEdit("prev") : undefined,
    onRight: isEdit ? () => navigateEdit("next") : undefined,
  });

  /* -- Upload step -- */
  if (step === "upload") {
    return (
      <div className="w-full max-w-[1200px]">
        <div className="max-w-[520px] w-full mx-auto mt-16 animate-fadeUp">
          <div className="text-center mb-8">
            <h1 className="text-[28px] font-bold mb-2 tracking-tight">Smart Crop</h1>
            <p className="text-[15px] text-text-muted leading-relaxed">
              Pick a ratio and drop images to start.
            </p>
          </div>
          <RatioDropZones onDropWithRatio={loadAndAnalyzeWithRatio} />
        </div>
      </div>
    );
  }

  /* -- Ratio step -- */
  if (step === "ratio") {
    return (
      <div className="w-full max-w-[1200px]">
        <div className="mt-16 mx-auto">
          <RatioPicker
            subtitle={`${items.length} image${items.length !== 1 ? "s" : ""} loaded`}
            onPick={startAnalysis}
            onBack={reset}
          />
        </div>
      </div>
    );
  }

  /* -- Recrop (change ratio) -- */
  if (step === "recrop") {
    return (
      <div className="w-full max-w-[1200px]">
        <div className="mt-16 mx-auto">
          <RatioPicker
            subtitle="Change ratio for all images"
            onPick={(v, l) => { batchRecrop(v, l); }}
            onBack={() => setStep("review")}
          />
        </div>
      </div>
    );
  }

  /* -- Edit view -- */
  if (isEdit && editItem && editCrop) {
    return (
      <div className="w-full max-w-[1200px]">
        <div className="flex flex-col items-center gap-4 animate-fadeUp">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-lg font-bold tracking-tight">Edit crop</span>
            <Badge>{ratioLabel}</Badge>
            <span className="text-sm text-text-muted font-medium">
              {editIdx + 1} of {items.length}
            </span>
            <SizeInput
              cropPx={editCropPx}
              cropPy={editCropPy}
              ratio={ratio}
              crop={editCrop}
              setCrop={setEditCrop}
              disp={editItem.disp}
              nat={editItem.natural}
            />
          </div>
          <ZoomableEditor
            src={editItem.src}
            disp={editItem.disp}
            crop={editCrop}
            setCrop={setEditCrop}
            ratio={ratio}
            onDown={(e, t) => startDrag(e, t, editCrop, setEditCrop, ratio, editItem.disp.dw, editItem.disp.dh, zoom)}
            zoom={zoom}
            setZoom={setZoom}
            pan={pan}
            setPan={setPan}
          />
          {items.length > 1 && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => navigateEdit("prev")} disabled={editIdx === 0}>
                &larr; Prev
              </Button>
              <ImageFilmstrip
                items={items.map((it, idx) => ({
                  src: it.src,
                  name: it.name,
                  natural: it.natural,
                  disp: it.disp,
                  crop: it.crop ?? { x: 0, y: 0, w: 0, h: 0 },
                  adjusted: false,
                }))}
                currentIdx={editIdx}
                onSelect={(idx) => {
                  saveAndCloseEdit();
                  setTimeout(() => openEdit(idx), 0);
                }}
              />
              <Button size="sm" onClick={() => navigateEdit("next")} disabled={editIdx === items.length - 1}>
                Next &rarr;
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap justify-center mt-1">
            <Button onClick={saveAndCloseEdit}>Save &amp; back</Button>
            <Button
              variant="primary"
              onClick={() => dlCrop(editItem.src, editItem.natural, editItem.disp, editCrop, cropFilename(editItem.name))}
            >
              <DlIcon /> Download
            </Button>
            {items.length > 1 && (
              <Button variant="primary" onClick={() => dlAll(items)}>
                <DlIcon /> Download all
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* -- Review grid -- */
  return (
    <div className="w-full max-w-[1200px]">
      <div className="animate-fadeUp">
        {/* Header bar */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <span className="text-lg font-bold tracking-tight">Results</span>
          <Badge>{ratioLabel}</Badge>
          {analyzingCount > 0 && (
            <span className="text-xs text-text-muted">
              Processing {analyzingCount} image{analyzingCount !== 1 ? "s" : ""}...
            </span>
          )}
          <div className="flex-1" />
          <Button size="sm" onClick={() => setStep("recrop")}>
            <RatioIcon /> Change ratio
          </Button>
          <Button size="sm" onClick={reset}>New batch</Button>
          <Button size="sm" variant="primary" onClick={() => dlAll(items)} disabled={doneCount === 0}>
            <DlIcon /> Download all
          </Button>
        </div>

        {items.length > 1 && (
          <p className="text-xs text-text-dim mb-4">
            Drag cards to reorder download sequence
          </p>
        )}

        {/* Grid */}
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
        >
          {items.map((item, idx) => (
            <div
              key={idx}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(idx); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => {
                if (dragIdx !== null && dragIdx !== idx) reorderItems(dragIdx, idx);
                setDragIdx(null);
                setDragOver(null);
              }}
              onDragEnd={() => { setDragIdx(null); setDragOver(null); }}
              className={`
                bg-surface border rounded-xl overflow-hidden transition-all duration-150
                ${dragOver === idx ? "border-primary ring-2 ring-primary/20" : "border-border"}
                ${dragIdx === idx ? "opacity-50" : ""}
              `}
            >
              {/* Image preview */}
              <div className="relative aspect-[4/3] overflow-hidden bg-surface-alt">
                {item.crop && item.status === "done" ? (
                  <img
                    src={item.src}
                    alt={item.name}
                    className="absolute"
                    draggable={false}
                    style={{
                      width: `${(item.disp.dw / item.crop.w) * 100}%`,
                      height: `${(item.disp.dh / item.crop.h) * 100}%`,
                      left: `${-(item.crop.x / item.crop.w) * 100}%`,
                      top: `${-(item.crop.y / item.crop.h) * 100}%`,
                    }}
                  />
                ) : (
                  <img
                    src={item.src}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                )}

                {/* Analyzing overlay */}
                {(item.status === "analyzing" || item.status === "recalculating") && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
                    <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}

                {/* Error overlay */}
                {item.status === "error" && (
                  <div className="absolute inset-0 bg-red-900/40 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2">
                    <span className="text-xs text-white font-semibold">Analysis failed</span>
                    <Button size="sm" variant="danger" onClick={() => retryItem(idx)}>
                      <RetryIcon /> Retry
                    </Button>
                  </div>
                )}

                {/* Drag handle */}
                <div className="absolute top-2 left-2 z-10 bg-black/50 rounded-md p-1.5 text-white/80 cursor-grab active:cursor-grabbing">
                  <GripIcon />
                </div>
              </div>

              {/* Bottom section */}
              <div className="p-3">
                <p className="text-xs font-medium text-text truncate mb-1">{item.name}</p>
                {item.focal?.label && (
                  <p className="text-[10px] text-text-muted truncate mb-2">{item.focal.label}</p>
                )}
                <div className="flex items-center gap-1.5">
                  {item.status === "done" && (
                    <Button size="sm" onClick={() => openEdit(idx)}>Edit</Button>
                  )}
                  {item.status === "error" && (
                    <Button size="sm" onClick={() => retryItem(idx)}>
                      <RetryIcon /> Retry
                    </Button>
                  )}
                  {item.status === "done" && item.crop && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => dlCrop(item.src, item.natural, item.disp, item.crop!, cropFilename(item.name))}
                    >
                      <DlIcon />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
