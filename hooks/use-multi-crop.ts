"use client";

import { useState, useCallback, useRef } from "react";
import { MultiCropItem, CropRect } from "@/lib/types";
import { dispSize, readFileAsImage } from "@/lib/image-utils";
import { centeredOnBbox } from "@/lib/crop-math";
import { detectFocalWithFallback } from "@/lib/ai-client";
import { isAcceptedFile } from "@/lib/constants";

type MultiStep = "upload" | "ratio" | "review" | "recrop";

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

  const buildItem = (img: { src: string; name: string; nat: { w: number; h: number } }, mime: string, ratioVal: number | null, status: MultiCropItem["status"]): MultiCropItem => {
    const maxW = Math.min(window.innerWidth - 96, img.nat.w);
    const maxH = Math.min(window.innerHeight - 230, img.nat.h);
    return {
      src: img.src, name: img.name, mime,
      natural: img.nat,
      disp: dispSize(img.nat.w, img.nat.h, maxW, maxH),
      status, focal: null, crop: null,
      ratio: ratioVal ?? img.nat.w / img.nat.h,
    };
  };

  const loadImages = useCallback(async (files: FileList) => {
    setLoadError(null);
    const arr = Array.from(files).filter((f) => isAcceptedFile(f));
    if (!arr.length) return;
    const results = await Promise.all(arr.map(readFileAsImage));
    const ok: MultiCropItem[] = [];
    arr.forEach((f, i) => {
      const r = results[i];
      if (r) ok.push(buildItem(r, f.type, 1, "pending"));
    });
    const failed = arr.length - ok.length;
    if (!ok.length) {
      setLoadError(`Couldn't read ${arr.length === 1 ? "that image" : "any of those images"}. Try a different file.`);
      return;
    }
    if (failed > 0) setLoadError(`Skipped ${failed} unreadable file${failed === 1 ? "" : "s"}.`);
    setItems(ok);
    setStep("ratio");
  }, []);

  const runAnalysis = useCallback(async (currentItems: MultiCropItem[], ratioVal: number | null) => {
    const myGen = ++analysisGen.current;
    for (let idx = 0; idx < currentItems.length; idx++) {
      if (myGen !== analysisGen.current) return; // cancelled by newer run
      const item = currentItems[idx];
      if (item.focal?.bbox && !item.focal?.error) {
        setItems((prev) => {
          if (myGen !== analysisGen.current) return prev;
          const next = [...prev];
          const r = ratioVal ?? next[idx].ratio;
          next[idx] = {
            ...next[idx], status: "done", ratio: r,
            crop: centeredOnBbox(next[idx].disp.dw, next[idx].disp.dh, ratioVal, next[idx].focal!.bbox, next[idx].focal?.focalPoint),
          };
          return next;
        });
        continue;
      }
      const focal = await detectFocalWithFallback(item.src, item.mime, item.natural.w, item.natural.h);
      if (myGen !== analysisGen.current) return;
      setItems((prev) => {
        if (myGen !== analysisGen.current) return prev;
        const next = [...prev];
        const r = ratioVal ?? next[idx].ratio;
        next[idx] = {
          ...next[idx], focal, status: focal.error ? "error" : "done", ratio: r,
          crop: centeredOnBbox(next[idx].disp.dw, next[idx].disp.dh, ratioVal, focal.bbox, focal.focalPoint),
        };
        return next;
      });
    }
  }, []);

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
    setLoadError(null);
    const arr = Array.from(files).filter((f) => isAcceptedFile(f));
    if (!arr.length) return;

    const results = await Promise.all(arr.map(readFileAsImage));
    const ok: MultiCropItem[] = [];
    arr.forEach((f, i) => {
      const r = results[i];
      if (r) ok.push(buildItem(r, f.type, ratioVal, "analyzing"));
    });
    const failed = arr.length - ok.length;
    if (!ok.length) {
      setLoadError(`Couldn't read ${arr.length === 1 ? "that image" : "any of those images"}. Try a different file.`);
      return;
    }
    if (failed > 0) setLoadError(`Skipped ${failed} unreadable file${failed === 1 ? "" : "s"}.`);

    setItems(ok);
    setRatio(ratioVal);
    setRatioLabel(rLabel);
    setStep("review");
    runAnalysis(ok, ratioVal);
  }, [runAnalysis]);

  const batchRecrop = useCallback((ratioVal: number | null, rLabel: string) => {
    setRatioLabel(rLabel);
    setRatio(ratioVal);
    const updated = items.map((it) => {
      const effR = ratioVal ?? it.natural.w / it.natural.h;
      if (it.focal?.bbox && !it.focal?.error) {
        return {
          ...it, ratio: effR, status: "done" as const,
          crop: centeredOnBbox(it.disp.dw, it.disp.dh, ratioVal, it.focal.bbox, it.focal.focalPoint),
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
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "analyzing", focal: null };
      return next;
    });
    const myGen = analysisGen.current;
    (async () => {
      const focal = await detectFocalWithFallback(current.src, current.mime, current.natural.w, current.natural.h);
      if (myGen !== analysisGen.current) return;
      setItems((prev) => {
        if (myGen !== analysisGen.current) return prev;
        const next = [...prev];
        next[idx] = {
          ...next[idx], focal, status: focal.error ? "error" : "done",
          crop: centeredOnBbox(next[idx].disp.dw, next[idx].disp.dh, ratio, focal.bbox, focal.focalPoint),
        };
        return next;
      });
    })();
  }, [items, ratio]);

  const reorderItems = useCallback((fromIdx: number, toIdx: number) => {
    setItems((prev) => {
      const next = [...prev];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, removed);
      return next;
    });
  }, []);

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
    loadError, clearLoadError: () => setLoadError(null),
    loadImages, loadAndAnalyzeWithRatio, startAnalysis, batchRecrop, retryItem,
    reorderItems, openEdit, saveAndCloseEdit, navigateEdit, reset,
  };
}
