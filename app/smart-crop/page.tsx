"use client";

import { useState } from "react";
import { useMultiCrop } from "@/hooks/use-multi-crop";
import { useCropDrag } from "@/hooks/use-crop-drag";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { DropZone } from "@/components/ui/drop-zone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SizeInput } from "@/components/ui/size-input";
import { RatioPicker } from "@/components/crop/ratio-picker";
import { ZoomableEditor } from "@/components/crop/zoomable-editor";
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
    loadImages, startAnalysis, batchRecrop, retryItem,
    reorderItems, openEdit, saveAndCloseEdit, navigateEdit, reset,
  } = useMultiCrop();
  const { startDrag } = useCropDrag();
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

  /* ── Upload step ── */
  if (step === "upload") {
    return (
      <div className="w-full max-w-[1200px]">
        <div className="max-w-[460px] w-full mx-auto mt-16 animate-fadeUp">
          <div className="text-center mb-8">
            <h1 className="text-[28px] font-bold mb-2 tracking-tight">AI Smart Crop</h1>
            <p className="text-[15px] text-text-muted leading-relaxed">
              Upload images, pick a ratio, and let AI find the best crop.
            </p>
          </div>
          <DropZone onFiles={loadImages} multiple>
            {(over) => (
              <>
                <div className="w-14 h-14 rounded-[14px] bg-primary-bg flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#022C12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <rect x="7" y="7" width="18" height="18" rx="2" ry="2" opacity="0.4" />
                  </svg>
                </div>
                <p className={`text-[15px] font-medium ${over ? "text-primary" : "text-text-secondary"}`}>
                  Drop images here or <span className="text-primary font-bold">browse</span>
                </p>
                <p className="text-xs mt-2 text-text-dim">PNG, JPG, or WebP &middot; multiple files supported</p>
              </>
            )}
          </DropZone>
        </div>
      </div>
    );
  }

  /* ── Ratio step ── */
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

  /* ── Recrop (change ratio) ── */
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

  /* ── Edit view ── */
  if (isEdit && editItem && editCrop) {
    return (
      <div className="w-full max-w-[1200px]">
        <div className="flex flex-col items-center gap-4 animate-fadeUp">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-lg font-bold tracking-tight">Edit crop</span>
            <Badge>{ratioLabel}</Badge>
            <span className="text-sm text-text-muted">
              {editIdx + 1} of {items.length}
            </span>
          </div>
          {editItem.focal?.label && (
            <p className="text-xs text-text-muted -mt-2">
              Focal: {editItem.focal.label}
            </p>
          )}
          <ZoomableEditor
            src={editItem.src}
            disp={editItem.disp}
            crop={editCrop}
            setCrop={setEditCrop}
            ratio={editItem.ratio}
            onDown={(e, t) => startDrag(e, t, editCrop, setEditCrop, editItem.ratio, editItem.disp.dw, editItem.disp.dh, zoom)}
            zoom={zoom}
            setZoom={setZoom}
            pan={pan}
            setPan={setPan}
          />
          <div className="flex items-center gap-2 flex-wrap justify-center mt-1">
            <SizeInput
              cropPx={editCropPx}
              cropPy={editCropPy}
              ratio={editItem.ratio}
              crop={editCrop}
              setCrop={setEditCrop}
              disp={editItem.disp}
              nat={editItem.natural}
            />
            <Button
              onClick={() => navigateEdit("prev")}
              disabled={editIdx === 0}
              size="sm"
            >
              &larr; Prev
            </Button>
            <Button
              onClick={() => navigateEdit("next")}
              disabled={editIdx === items.length - 1}
              size="sm"
            >
              Next &rarr;
            </Button>
            <Button onClick={saveAndCloseEdit}>Save &amp; back</Button>
            <Button
              variant="primary"
              onClick={() => dlCrop(editItem.src, editItem.natural, editItem.disp, editCrop, cropFilename(editItem.name))}
            >
              <DlIcon /> Download
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Review grid ── */
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
                <img
                  src={item.src}
                  alt={item.name}
                  className="w-full h-full object-cover"
                  draggable={false}
                />

                {/* Crop overlay visualization */}
                {item.crop && item.status === "done" && (
                  <div
                    className="absolute border-2 border-primary/70 bg-primary/10 rounded-sm pointer-events-none"
                    style={{
                      left: `${(item.crop.x / item.disp.dw) * 100}%`,
                      top: `${(item.crop.y / item.disp.dh) * 100}%`,
                      width: `${(item.crop.w / item.disp.dw) * 100}%`,
                      height: `${(item.crop.h / item.disp.dh) * 100}%`,
                    }}
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
