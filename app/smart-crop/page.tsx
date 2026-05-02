"use client";

import { useState } from "react";
import { useMultiCrop } from "@/hooks/use-multi-crop";
import { useCropDrag } from "@/hooks/use-crop-drag";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useClipboardPaste } from "@/hooks/use-clipboard-paste";
import { useConfirm } from "@/hooks/use-confirm";
import { RatioDropZones } from "@/components/crop/ratio-drop-zones";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
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
  const resetConfirm = useConfirm({ onConfirm: reset, count: items.length, threshold: 1 });

  useKeyboardShortcuts({
    disableModeNav: step === "ratio" || step === "recrop",
    onEnter: isEdit && editItem?.crop && editCrop
      ? () => dlCrop(editItem.src, editItem.natural, editItem.disp, editCrop, cropFilename(editItem.name))
      : undefined,
    onEscape: isEdit ? saveAndCloseEdit : step === "review" ? resetConfirm.fire : undefined,
    onLeft: isEdit ? () => navigateEdit("prev") : undefined,
    onRight: isEdit ? () => navigateEdit("next") : undefined,
  });

  /* -- Upload step -- */
  if (step === "upload") {
    return (
      <div className="w-full max-w-[1200px]">
        <div className="max-w-[662px] w-full mx-auto mt-16 animate-fadeUp">
          <div className="text-center mb-2">
            <h1 className="font-display uppercase font-bold text-[44px] text-primary leading-[0.95] tracking-[-0.005em] mb-2">
              Smart Crop
            </h1>
            <p className="text-[15px] text-text-secondary leading-[1.5]">
              AI finds faces and focal points across a batch. You review and adjust.
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
            onBack={resetConfirm.fire}
            backLabel={resetConfirm.armed ? `Press again to clear ${items.length} image${items.length === 1 ? "" : "s"}` : "← Go back"}
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
          <div className="flex items-center gap-2.5 mb-1 flex-wrap justify-center">
            <span className="font-display uppercase font-bold text-[18px] text-primary tracking-[0.02em]">Edit crop</span>
            <Badge>{ratioLabel}</Badge>
            <span className="text-[13px] text-text-muted font-medium tabular-nums">
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
              <Button size="sm" aria-label="Previous image" onClick={() => navigateEdit("prev")} disabled={editIdx === 0}>
                ← Prev
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
              <Button size="sm" aria-label="Next image" onClick={() => navigateEdit("next")} disabled={editIdx === items.length - 1}>
                Next →
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
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-display uppercase font-bold text-[18px] text-primary tracking-[0.02em]">Results</span>
            <Badge>{ratioLabel}</Badge>
            {analyzingCount > 0 && (
              <span className="text-xs text-text-muted">
                Processing {analyzingCount} image{analyzingCount !== 1 ? "s" : ""}...
              </span>
            )}
          </div>
          <div className="sm:flex-1" />
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => setStep("recrop")}>
              <RatioIcon /> Change ratio
            </Button>
            <ConfirmButton
              size="sm"
              armed={resetConfirm.armed}
              onFire={resetConfirm.fire}
              confirmLabel={`Clear ${items.length} image${items.length === 1 ? "" : "s"}?`}
            >
              New batch
            </ConfirmButton>
            <Button size="sm" variant="primary" onClick={() => dlAll(items)} disabled={doneCount === 0}>
              <DlIcon /> Download all
            </Button>
          </div>
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
                hover:border-border-hover
                ${dragOver === idx ? "border-primary ring-2 ring-primary/20" : "border-border"}
                ${dragIdx === idx ? "opacity-50" : ""}
              `}
            >
              {/* Image preview */}
              <div className="relative aspect-[4/3] overflow-hidden bg-surface-alt flex items-center justify-center">
                {(() => {
                  const imgAR = item.disp.dw / item.disp.dh;
                  const cardAR = 4 / 3;
                  const pctW = imgAR > cardAR ? 100 : (imgAR / cardAR) * 100;
                  const pctH = imgAR > cardAR ? (cardAR / imgAR) * 100 : 100;
                  return (
                    <div className="relative" style={{ width: `${pctW}%`, height: `${pctH}%` }}>
                      <img
                        src={item.src}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full"
                        draggable={false}
                      />
                      {item.crop && item.status === "done" && (
                        <div
                          className="absolute border-2 border-accent pointer-events-none animate-fadeIn"
                          style={{
                            left: `${(item.crop.x / item.disp.dw) * 100}%`,
                            top: `${(item.crop.y / item.disp.dh) * 100}%`,
                            width: `${(item.crop.w / item.disp.dw) * 100}%`,
                            height: `${(item.crop.h / item.disp.dh) * 100}%`,
                            boxShadow: "0 0 0 9999px var(--crop-dim-soft)",
                          }}
                        />
                      )}
                    </div>
                  );
                })()}

                {/* Analyzing overlay */}
                {(item.status === "analyzing" || item.status === "recalculating") && (
                  <div
                    role="status"
                    aria-label="Analyzing image"
                    className="absolute inset-0 backdrop-blur-[2px] flex items-center justify-center"
                    style={{ background: "var(--overlay-analyzing)" }}
                  >
                    <div
                      className="w-[30px] h-[30px] rounded-full animate-spin"
                      style={{ border: "3px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }}
                    />
                  </div>
                )}

                {/* Error overlay */}
                {item.status === "error" && (
                  <div
                    className="absolute inset-0 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 px-3 text-center"
                    style={{ background: "var(--overlay-error)" }}
                    title={item.focal?.error || "Analysis didn't return a result"}
                  >
                    <span className="text-[12px] text-white font-semibold leading-snug">
                      Couldn&apos;t read this one
                    </span>
                    {item.focal?.error && (
                      <span className="text-[10px] text-white/75 leading-snug max-w-[200px] line-clamp-2">
                        {item.focal.error}
                      </span>
                    )}
                    <Button size="sm" variant="danger" onClick={() => retryItem(idx)}>
                      <RetryIcon /> Retry
                    </Button>
                  </div>
                )}

                {/* Drag handle */}
                <div
                  aria-hidden="true"
                  className="absolute top-2 left-2 z-10 rounded-md p-1.5 text-white/85 cursor-grab active:cursor-grabbing backdrop-blur-[4px]"
                  style={{ background: "var(--overlay-handle)" }}
                >
                  <GripIcon />
                </div>
              </div>

              {/* Bottom section */}
              <div className="p-3">
                <p className="text-xs font-medium text-text truncate mb-1.5">{item.name}</p>
                {item.focal?.label && item.status === "done" && (
                  <span
                    className="inline-block text-[11px] font-medium text-primary bg-lichen rounded-md px-2 py-0.5 mb-2.5 max-w-full truncate"
                    title={item.focal.label}
                  >
                    {item.focal.label}
                  </span>
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
                      aria-label={`Download ${item.name}`}
                      onClick={() => dlCrop(item.src, item.natural, item.disp, item.crop!, cropFilename(item.name))}
                    >
                      <DlIcon />
                    </Button>
                  )}
                  {items.length > 1 && (
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        size="sm"
                        aria-label={`Move ${item.name} earlier in download order`}
                        onClick={() => reorderItems(idx, idx - 1)}
                        disabled={idx === 0}
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        aria-label={`Move ${item.name} later in download order`}
                        onClick={() => reorderItems(idx, idx + 1)}
                        disabled={idx === items.length - 1}
                      >
                        ↓
                      </Button>
                    </div>
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
