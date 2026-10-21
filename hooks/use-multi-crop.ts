"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { MultiCropItem, CropRect } from "@/lib/types";
import { editorDispSize, rescaleCrop, revokeSrc, LoadedImage } from "@/lib/image-utils";
import { loadImageFiles } from "@/lib/load-images";
import { centeredOnBbox } from "@/lib/crop-math";
import { safeZoneForRatio } from "@/lib/storefront";
import { detectFocalWithFallback } from "@/lib/ai-client";
import { useWindowResize } from "./use-window-resize";

type MultiStep = "upload" | "ratio" | "review" | "recrop";

let nextId = 1;
const newId = () => `mc-${Date.now().toString(36)}-${nextId++}`;

export function useMultiCrop() {
  const [step, setStep] = useState<MultiStep>("upload");
  const [items, setItems] = useState<MultiCropItem[]>([]);
  const [ratio, setRatio] = useState<number | null>(1);
  const [ratioLabel, setRatioLabel] = useState("1:1");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editCrop, setEditCrop] = useState<CropRect | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const analysisGen = useRef(0);

  const srcsRef = useRef<string[]>([]);
  useEffect(() => {
    srcsRef.current = items.map((it) => it.src);
  }, [items]);

  const buildItem = (img: LoadedImage, ratioVal: number | null, status: MultiCropItem["status"]): MultiCropItem => ({
    id: newId(),
    src: img.src, name: img.name,
    natural: img.nat,
    disp: editorDispSize(img.nat),
    status, focal: null, crop: null,
    ratio: ratioVal ?? img.nat.w / img.nat.h,
  });

  const load = useCallback(async (files: FileList): Promise<LoadedImage[] | null> => {
    setLoadError(null);
    const { images, error } = await loadImageFiles(files);
    if (error) setLoadError(error);
    return images.length ? images : null;
  }, []);

  const loadImages = useCallback(async (files: FileList) => {
    const ok = await load(files);
    if (!ok) return;
    setItems(ok.map((img) => buildItem(img, 1, "pending")));
    setStep("ratio");
  }, [load]);

  /** Write an analysis result onto the item with `id`, wherever it now sits in the list. */
  const applyResult = useCallback((id: string, ratioVal: number | null, update: (it: MultiCropItem) => Partial<MultiCropItem>) => {
    setItems((prev) => {
      const i = prev.findIndex((it) => it.id === id);
      if (i < 0) return prev;
      const next = [...prev];
      const it = next[i];
      next[i] = { ...it, ratio: ratioVal ?? it.ratio, ...update(it) };
      return next;
    });
  }, []);

  const runAnalysis = useCallback(async (currentItems: MultiCropItem[], ratioVal: number | null) => {
    const myGen = ++analysisGen.current;
    for (const item of currentItems) {
      if (myGen !== analysisGen.current) return; // cancelled by newer run
      if (item.focal?.bbox && !item.focal?.error) {
        applyResult(item.id, ratioVal, (it) => ({
          status: "done",
          crop: centeredOnBbox(it.disp.dw, it.disp.dh, ratioVal, it.focal!.bbox, it.focal?.focalPoint, safeZoneForRatio(ratioVal)),
        }));
        continue;
      }
      const focal = await detectFocalWithFallback(item.src, item.natural.w, item.natural.h);
      if (myGen !== analysisGen.current) return;
      applyResult(item.id, ratioVal, (it) => ({
        focal, status: focal.error ? "error" : "done",
        crop: centeredOnBbox(it.disp.dw, it.disp.dh, ratioVal, focal.bbox, focal.focalPoint, safeZoneForRatio(ratioVal)),
      }));
    }
  }, [applyResult]);

  const startAnalysis = useCallback((ratioVal: number | null, rLabel: string) => {
    setRatioLabel(rLabel);
    setRatio(ratioVal);
    const withStatus = items.map((it) => ({
      ...it,
      status: (it.focal?.bbox && !it.focal?.error ? "recalculating" : "analyzing") as MultiCropItem["status"],
      ratio: ratioVal ?? it.natural.w / it.natural.h,
    }));
    setItems(withStatus);
    setStep("review");
    runAnalysis(withStatus, ratioVal);
  }, [items, runAnalysis]);

  const loadAndAnalyzeWithRatio = useCallback(async (files: FileList, ratioVal: number | null, rLabel: string) => {
    const ok = await load(files);
    if (!ok) return;
    const built = ok.map((img) => buildItem(img, ratioVal, "analyzing"));
    setItems(built);
    setRatio(ratioVal);
    setRatioLabel(rLabel);
    setStep("review");
    runAnalysis(built, ratioVal);
  }, [load, runAnalysis]);

  const batchRecrop = useCallback((ratioVal: number | null, rLabel: string) => {
    setRatioLabel(rLabel);
    setRatio(ratioVal);
    const updated = items.map((it) => {
      const effR = ratioVal ?? it.natural.w / it.natural.h;
      if (it.focal?.bbox && !it.focal?.error) {
        return {
          ...it, ratio: effR, status: "done" as const,
          crop: centeredOnBbox(it.disp.dw, it.disp.dh, ratioVal, it.focal.bbox, it.focal.focalPoint, safeZoneForRatio(ratioVal)),
        };
      }
      return { ...it, ratio: effR, status: "analyzing" as const };
    });
    setItems(updated);
    setStep("review");
    if (updated.some((it) => it.status === "analyzing")) runAnalysis(updated, ratioVal);
  }, [items, runAnalysis]);

  const retryItem = useCallback((idx: number) => {
    const current = items[idx];
    if (!current || current.status === "analyzing" || current.status === "recalculating") return;
    const { id } = current;
    applyResult(id, null, () => ({ status: "analyzing", focal: null }));
    const myGen = analysisGen.current;
    (async () => {
      const focal = await detectFocalWithFallback(current.src, current.natural.w, current.natural.h);
      // A newer batch run owns every item now; it will re-analyze this one itself.
      if (myGen !== analysisGen.current) return;
      applyResult(id, null, (it) => ({
        focal, status: focal.error ? "error" : "done",
        crop: centeredOnBbox(it.disp.dw, it.disp.dh, ratio, focal.bbox, focal.focalPoint, safeZoneForRatio(ratio)),
      }));
    })();
  }, [items, ratio, applyResult]);

  const reorderItems = useCallback((fromIdx: number, toIdx: number) => {
    setItems((prev) => {
      const next = [...prev];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, removed);
      return next;
    });
  }, []);

  // Keep editor display sizes in step with the viewport; crops are display-space so they scale along.
  useWindowResize(() => {
    // The open editor's working crop lives in separate state: rescale it with its item.
    if (editIdx !== null && editCrop && items[editIdx]) {
      const it = items[editIdx];
      const d = editorDispSize(it.natural);
      if (d.dw !== it.disp.dw || d.dh !== it.disp.dh) setEditCrop(rescaleCrop(editCrop, it.disp, d));
    }
    setItems((prev) => prev.map((it) => {
      const d = editorDispSize(it.natural);
      if (d.dw === it.disp.dw && d.dh === it.disp.dh) return it;
      return { ...it, disp: d, crop: it.crop ? rescaleCrop(it.crop, it.disp, d) : null };
    }));
  });

  const openEdit = useCallback((idx: number) => {
    setEditIdx(idx);
    setEditCrop(items[idx].crop ? { ...items[idx].crop! } : null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [items]);

  const saveAndCloseEdit = useCallback(() => {
    if (editIdx !== null && editCrop) {
      setItems((prev) => {
        const next = [...prev];
        next[editIdx] = { ...next[editIdx], crop: { ...editCrop } };
        return next;
      });
    }
    setEditIdx(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [editIdx, editCrop]);

  const navigateEdit = useCallback((direction: "prev" | "next") => {
    if (editIdx === null) return;
    const newIdx = direction === "prev" ? editIdx - 1 : editIdx + 1;
    if (newIdx < 0 || newIdx >= items.length) return;
    // save current
    if (editCrop) {
      setItems((prev) => {
        const next = [...prev];
        next[editIdx] = { ...next[editIdx], crop: { ...editCrop } };
        return next;
      });
    }
    setEditIdx(newIdx);
    setEditCrop(items[newIdx].crop ? { ...items[newIdx].crop! } : null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [editIdx, editCrop, items]);

  const reset = useCallback(() => {
    analysisGen.current++;
    srcsRef.current.forEach(revokeSrc);
    setItems([]);
    setEditIdx(null);
    setStep("upload");
    setLoadError(null);
  }, []);

  const editItem = editIdx !== null ? items[editIdx] : null;
  const editCropPx = editItem ? Math.round(((editCrop?.w || 0) * editItem.natural.w) / (editItem.disp.dw || 1)) : 0;
  const editCropPy = editItem ? Math.round(((editCrop?.h || 0) * editItem.natural.h) / (editItem.disp.dh || 1)) : 0;
  const doneCount = items.filter((it) => it.status === "done").length;
  const errCount = items.filter((it) => it.status === "error").length;
  const analyzingCount = items.filter((it) => it.status === "analyzing" || it.status === "recalculating").length;

  return {
    step, setStep, items, ratio, ratioLabel,
    editIdx, editItem, editCrop, setEditCrop,
    editCropPx, editCropPy,
    zoom, setZoom, pan, setPan,
    doneCount, errCount, analyzingCount,
    loadError, clearLoadError: () => setLoadError(null), reportLoadError: setLoadError,
    loadImages, loadAndAnalyzeWithRatio, startAnalysis, batchRecrop, retryItem,
    reorderItems, openEdit, saveAndCloseEdit, navigateEdit, reset,
  };
}
