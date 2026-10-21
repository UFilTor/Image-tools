"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { MultiCropItem, CropRect } from "@/lib/types";
import { editorDispSize, rescaleCrop, revokeSrc, LoadedImage } from "@/lib/image-utils";
import { loadImageFiles } from "@/lib/load-images";
import { centeredOnBbox } from "@/lib/crop-math";
import { EXPERIENCE_SET_MAX, SET_OVERFLOW_NOTE, safeZoneForRatio, withSetPresets } from "@/lib/storefront";
import { FULL_EXPERIENCE } from "@/lib/constants";
import { detectFocalWithFallback } from "@/lib/ai-client";
import { useWindowResize } from "./use-window-resize";

type MultiStep = "upload" | "ratio" | "review" | "recrop";

let nextId = 1;
const newId = () => `mc-${Date.now().toString(36)}-${nextId++}`;

/** The shape an item is cropped at: its own in Full experience, otherwise the batch ratio. */
const ratioOf = (it: MultiCropItem, batchRatio: number | null): number | null => (it.preset ? it.preset.value : batchRatio);

/** Crop around the item's subject at `r`, keeping it inside that shape's storefront safe zone. */
const subjectCrop = (it: MultiCropItem, r: number | null, focal = it.focal) =>
  centeredOnBbox(it.disp.dw, it.disp.dh, r, focal?.bbox ?? null, focal?.focalPoint, safeZoneForRatio(r));

/**
 * Full experience after a reorder: roles follow position (first is the main photo), and photos
 * whose shape changed are re-cropped around their subject.
 */
const reassignRoles = (list: MultiCropItem[]): MultiCropItem[] =>
  withSetPresets(list).map((it, i) => {
    if (list[i].preset?.value === it.preset.value) return it;
    return { ...it, ratio: it.preset.value, crop: it.crop || it.focal ? subjectCrop(it, it.preset.value) : null };
  });

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
  /** Full experience: says when more photos came in than the page shows */
  const [setNote, setSetNote] = useState<string | null>(null);
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
      next[i] = { ...it, ratio: ratioOf(it, ratioVal) ?? it.ratio, ...update(it) };
      return next;
    });
  }, []);

  const runAnalysis = useCallback(async (currentItems: MultiCropItem[], ratioVal: number | null) => {
    const myGen = ++analysisGen.current;
    for (const item of currentItems) {
      if (myGen !== analysisGen.current) return; // cancelled by newer run
      if (item.focal?.bbox && !item.focal?.error) {
        applyResult(item.id, ratioVal, (it) => ({ status: "done", crop: subjectCrop(it, ratioOf(it, ratioVal)) }));
        continue;
      }
      const focal = await detectFocalWithFallback(item.src, item.natural.w, item.natural.h);
      if (myGen !== analysisGen.current) return;
      applyResult(item.id, ratioVal, (it) => ({
        focal, status: focal.error ? "error" : "done",
        crop: subjectCrop(it, ratioOf(it, ratioVal), focal),
      }));
    }
  }, [applyResult]);

  /**
   * Full experience: the items in page order become the main photo and the secondary photos, each
   * cropped at its own shape. Photos already analyzed are re-cropped at once; the rest are analyzed.
   */
  const applySet = useCallback((list: MultiCropItem[]) => {
    const kept = list.slice(0, EXPERIENCE_SET_MAX);
    list.slice(EXPERIENCE_SET_MAX).forEach((it) => revokeSrc(it.src));
    const updated = withSetPresets(kept).map((it): MultiCropItem => {
      const r = it.preset.value;
      return it.focal?.bbox && !it.focal.error
        ? { ...it, ratio: r, status: "done", crop: subjectCrop(it, r) }
        : { ...it, ratio: r, status: "analyzing" };
    });
    setItems(updated);
    setRatio(updated[0]?.preset?.value ?? null);
    setRatioLabel(FULL_EXPERIENCE.label);
    setSetNote(list.length > EXPERIENCE_SET_MAX ? SET_OVERFLOW_NOTE : null);
    setStep("review");
    if (updated.some((it) => it.status === "analyzing")) runAnalysis(updated, null);
  }, [runAnalysis]);

  const startAnalysis = useCallback((ratioVal: number | null, rLabel: string) => {
    setRatioLabel(rLabel);
    setRatio(ratioVal);
    setSetNote(null);
    const withStatus = items.map((it) => ({
      ...it,
      preset: undefined,
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
    setSetNote(null);
    setStep("review");
    runAnalysis(built, ratioVal);
  }, [load, runAnalysis]);

  /** Full experience straight from a drop or a website: photos in page order. */
  const loadAndAnalyzeSet = useCallback(async (files: FileList) => {
    const ok = await load(files);
    if (ok) applySet(ok.map((img) => buildItem(img, null, "analyzing")));
  }, [load, applySet]);

  /** The ratio picker's Full experience card: the loaded (or current) photos in their order. */
  const pickSet = useCallback(() => applySet(items), [items, applySet]);

  const batchRecrop = useCallback((ratioVal: number | null, rLabel: string) => {
    setRatioLabel(rLabel);
    setRatio(ratioVal);
    setSetNote(null);
    const updated = items.map((it) => {
      const effR = ratioVal ?? it.natural.w / it.natural.h;
      if (it.focal?.bbox && !it.focal?.error) {
        return { ...it, preset: undefined, ratio: effR, status: "done" as const, crop: subjectCrop(it, ratioVal) };
      }
      return { ...it, preset: undefined, ratio: effR, status: "analyzing" as const };
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
        crop: subjectCrop(it, ratioOf(it, ratio), focal),
      }));
    })();
  }, [items, ratio, applyResult]);

  const reorderItems = useCallback((fromIdx: number, toIdx: number) => {
    setItems((prev) => {
      const next = [...prev];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, removed);
      return next.some((it) => it.preset) ? reassignRoles(next) : next;
    });
  }, []);

  /** Full experience, in the editor: make the photo being edited the main one and keep editing it. */
  const makeMainInEdit = useCallback(() => {
    if (editIdx === null || editIdx === 0 || !items[editIdx]) return;
    const next = reassignRoles([items[editIdx], ...items.filter((_, i) => i !== editIdx)]);
    setItems(next);
    setEditIdx(0);
    setEditCrop(next[0].crop ? { ...next[0].crop } : null);
  }, [editIdx, items]);

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
    setSetNote(null);
    setItems([]);
    setEditIdx(null);
    setStep("upload");
    setLoadError(null);
  }, []);

  const editItem = editIdx !== null ? items[editIdx] : null;
  const isSet = items.some((it) => it.preset);
  const editCropPx = editItem ? Math.round(((editCrop?.w || 0) * editItem.natural.w) / (editItem.disp.dw || 1)) : 0;
  const editCropPy = editItem ? Math.round(((editCrop?.h || 0) * editItem.natural.h) / (editItem.disp.dh || 1)) : 0;
  const doneCount = items.filter((it) => it.status === "done").length;
  const errCount = items.filter((it) => it.status === "error").length;
  const analyzingCount = items.filter((it) => it.status === "analyzing" || it.status === "recalculating").length;

  return {
    step, setStep, items, ratio, ratioLabel,
    isSet, setNote,
    editIdx, editItem, editCrop, setEditCrop,
    /** The shape the editor works at: the edited photo's own in Full experience */
    editRatio: editItem ? ratioOf(editItem, ratio) : ratio,
    editLabel: editItem?.preset?.label ?? ratioLabel,
    editCropPx, editCropPy,
    zoom, setZoom, pan, setPan,
    doneCount, errCount, analyzingCount,
    loadError, clearLoadError: () => setLoadError(null), reportLoadError: setLoadError,
    loadImages, loadAndAnalyzeWithRatio, loadAndAnalyzeSet, pickSet, startAnalysis, batchRecrop, retryItem,
    reorderItems, makeMainInEdit, openEdit, saveAndCloseEdit, navigateEdit, reset,
  };
}
