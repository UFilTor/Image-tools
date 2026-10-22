"use client";

import { useState, useCallback, useRef } from "react";
import { BoundingBox, NaturalSize } from "@/lib/types";
import { removeBg, recolorCanvas, fillCanvas, detectBackground, canFillBackground } from "@/lib/logo-processing";
import {
  LogoEdit, NewLogoEdit, HEX_RE, PaletteColor, applyEdits, canvasPalette, contrastingHex, currentBackground, isErase, sampleColor,
  snapBoxOnCanvas, snapToPalette,
} from "@/lib/logo-edits";
import { removeBgAI } from "@/lib/bg-removal";
import { checkApiAvailable, checkGatewayAvailable, requestImageEdit, requestLogoEdit } from "@/lib/ai-client";
import { buildRedrawRequest, trimRedraw } from "@/lib/logo-redraw";
import { BG_TOLERANCE } from "@/lib/constants";
import { canvasToObjectUrl, loadImageEl, revokeSrc } from "@/lib/image-utils";
import { loadImageFiles } from "@/lib/load-images";
import { errorMessage } from "@/lib/errors";

type LogoStep = "upload" | "edit";
/** Background removal: none, the solid-color key, or the in-browser AI model. */
export type BgMode = "off" | "color" | "ai";
/** Tool active on the processed preview: pick a color, or draw an area for the active edit. */
export type LogoTool = "pick" | "box" | null;

interface LogoSettings {
  bgMode: BgMode;
  edits: LogoEdit[];
  recolor: string;
  customHex: string;
  /** Background fill: color painted behind transparent areas, or null */
  bgFill: string | null;
}

const ERASE_HINT = "Drag a box over the part to remove. Shapes mostly inside it are removed whole.";

const DEFAULT_SETTINGS: LogoSettings = { bgMode: "color", edits: [], recolor: "none", customHex: "#022C12", bgFill: null };

interface BgStatus {
  busy: boolean;
  /** Model download progress 0..100 while it loads the first time, otherwise null */
  pct: number | null;
  error: string | null;
}

interface ClaudeStatus {
  available: boolean;
  busy: boolean;
  note: string | null;
  error: string | null;
}

interface RedrawStatus {
  /** AI Gateway configured */
  available: boolean;
  busy: boolean;
  error: string | null;
  /** Model result waiting for "Use AI version" or "Discard"; never applied on its own */
  candidate: { url: string; w: number; h: number } | null;
}

export function useLogoProcessor() {
  const [step, setStep] = useState<LogoStep>("upload");
  const [src, setSrc] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nat, setNat] = useState<NaturalSize>({ w: 0, h: 0 });
  const [isTransparent, setIsTransparent] = useState(false);
  const [settings, setSettings] = useState<LogoSettings>(DEFAULT_SETTINGS);
  const [preview, setPreview] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  const [tool, setTool] = useState<LogoTool>(null);
  const [toolHint, setToolHint] = useState<string | null>(null);
  const [activeEditId, setActiveEditId] = useState<string | null>(null);
  /** What a finished area drag does: set the active edit's area, or add a new erase. */
  const [boxFor, setBoxFor] = useState<"edit" | "erase">("edit");
  const [bgStatus, setBgStatus] = useState<BgStatus>({ busy: false, pct: null, error: null });
  const [claude, setClaude] = useState<ClaudeStatus>({ available: false, busy: false, note: null, error: null });
  const [editError, setEditError] = useState<string | null>(null);
  const [emptyResult, setEmptyResult] = useState(false);
  const [redraw, setRedraw] = useState<RedrawStatus>({ available: false, busy: false, error: null, candidate: null });

  // Decoded source and detected background, computed once per logo. Changing controls reuses
  // them instead of re-decoding and re-scanning the full image.
  const imgRef = useRef<HTMLImageElement | null>(null);
  const bgColorRef = useRef<[number, number, number] | null>(null);
  // One background-removed canvas per mode, as promises so a slow AI run is shared, not repeated.
  // A new logo replaces the Map, so a late result from the previous logo lands nowhere.
  const baseCache = useRef(new Map<BgMode, Promise<HTMLCanvasElement>>());
  // Last rendered stages: `edited` (bg + color edits) feeds picking and Claude; `final` is exported.
  const editedRef = useRef<HTMLCanvasElement | null>(null);
  const finalRef = useRef<HTMLCanvasElement | null>(null);
  const paletteRef = useRef<PaletteColor[]>([]);
  const settingsRef = useRef<LogoSettings>(DEFAULT_SETTINGS);
  const previewRef = useRef<string | null>(null);
  const srcRef = useRef<string | null>(null);
  const renderGen = useRef(0);
  const editIdRef = useRef(0);
  const lastHexRef = useRef(DEFAULT_SETTINGS.customHex);
  const candidateRef = useRef<{ canvas: HTMLCanvasElement; url: string } | null>(null);

  const dropCandidate = useCallback(() => {
    revokeSrc(candidateRef.current?.url);
    candidateRef.current = null;
    setRedraw((r) => ({ ...r, busy: false, error: null, candidate: null }));
  }, []);

  const getBase = useCallback((mode: BgMode): Promise<HTMLCanvasElement> => {
    const cache = baseCache.current;
    const cached = cache.get(mode);
    if (cached) return cached;
    const img = imgRef.current!;
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    cv.getContext("2d")!.drawImage(img, 0, 0);

    let p: Promise<HTMLCanvasElement>;
    if (mode === "off") p = Promise.resolve(cv);
    else if (mode === "color") p = Promise.resolve(removeBg(cv, BG_TOLERANCE, bgColorRef.current));
    else {
      setBgStatus({ busy: true, pct: null, error: null });
      const current = () => baseCache.current === cache;
      p = removeBgAI(cv, (pct) => current() && setBgStatus((st) => ({ ...st, pct })));
      p.then(
        () => current() && setBgStatus({ busy: false, pct: null, error: null }),
        (err) => {
          if (cache.get("ai") === p) cache.delete("ai"); // allow a retry
          if (current()) setBgStatus({ busy: false, pct: null, error: `AI background removal failed: ${errorMessage(err)}` });
        },
      );
    }
    cache.set(mode, p);
    return p;
  }, []);

  const render = useCallback(async (s: LogoSettings) => {
    if (!imgRef.current) return;
    const myGen = ++renderGen.current;

    let base: HTMLCanvasElement;
    try {
      base = await getBase(s.bgMode);
    } catch {
      // Error is reported through bgStatus; show the logo without removal meanwhile.
      base = await getBase("off");
    }
    if (myGen !== renderGen.current) return;

    let edited = base;
    try {
      edited = applyEdits(base, s.edits, BG_TOLERANCE, {
        bgHint: s.bgMode === "color" ? bgColorRef.current : null,
        // With the background kept, erased shapes are painted over in the background color.
        bg: s.bgMode === "off" ? currentBackground(bgColorRef.current, s.edits, BG_TOLERANCE * 2) : null,
        transparent: s.bgMode !== "off",
      });
      setEditError(null);
    } catch {
      // A failing edit must not freeze the preview: show the logo without the changes and say so.
      setEditError("One of the changes couldn't be applied. Remove the last change and try again.");
    }
    // While a custom hex is half-typed, keep recoloring with the last valid one instead of
    // silently dropping the recolor.
    if (HEX_RE.test(s.customHex)) lastHexRef.current = s.customHex;
    const wholeHex = s.recolor === "custom" ? lastHexRef.current : s.recolor;
    const recolored = s.recolor !== "none" && HEX_RE.test(wholeHex) ? recolorCanvas(edited, wholeHex) : edited;
    // The fill goes last, behind everything, so recolor and edits never touch it.
    const final = s.bgFill && HEX_RE.test(s.bgFill) ? fillCanvas(recolored, s.bgFill) : recolored;
    editedRef.current = edited;
    finalRef.current = final;
    const pal = canvasPalette(edited, BG_TOLERANCE);
    paletteRef.current = pal;
    setPalette(pal);
    // Nothing visible left after background removal: usually a one-color logo whose only color
    // was taken for the background.
    setEmptyResult(pal.length === 0 && s.bgMode !== "off");

    try {
      const url = await canvasToObjectUrl(final);
      if (myGen !== renderGen.current) {
        URL.revokeObjectURL(url);
        return;
      }
      revokeSrc(previewRef.current);
      previewRef.current = url;
      setPreview(url);
    } catch {
      setLoadError("Couldn't render the preview.");
    }
  }, [getBase]);

  /** Merge a settings change, then re-render. Every control goes through here. */
  const update = useCallback((patch: Partial<LogoSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    void render(next);
  }, [render]);

  const loadLogo = useCallback(async (files: FileList) => {
    setLoadError(null);
    const { images, error } = await loadImageFiles(files);
    const [loaded, ...extra] = images;
    extra.forEach((img) => revokeSrc(img.src)); // single-logo tool: release the rest
    if (!loaded) {
      setLoadError(error ?? "Couldn't read that logo. Try a different file.");
      return;
    }
    let img: HTMLImageElement;
    try {
      img = await loadImageEl(loaded.src);
    } catch {
      revokeSrc(loaded.src);
      setLoadError("Couldn't decode that logo. Try a PNG or JPG.");
      return;
    }

    const cv = document.createElement("canvas");
    cv.width = loaded.nat.w;
    cv.height = loaded.nat.h;
    cv.getContext("2d")!.drawImage(img, 0, 0);
    const bg = detectBackground(cv, BG_TOLERANCE);
    // Only treat as "already transparent" when there is no solid box left to remove
    const transparent = bg.hasAlpha && bg.color === null;

    // Drop everything from the previous logo so Enter/Download can't export it under the new name.
    renderGen.current++;
    revokeSrc(srcRef.current);
    revokeSrc(previewRef.current);
    previewRef.current = null;
    srcRef.current = loaded.src;
    imgRef.current = img;
    bgColorRef.current = bg.color;
    baseCache.current = new Map();
    editedRef.current = null;
    finalRef.current = null;
    setPreview(null);
    setPalette([]);
    setTool(null);
    setToolHint(null);
    setActiveEditId(null);
    setBgStatus({ busy: false, pct: null, error: null });
    setClaude((c) => ({ ...c, busy: false, note: null, error: null }));
    dropCandidate();

    setName(loaded.name);
    setNat(loaded.nat);
    setSrc(loaded.src);
    setIsTransparent(transparent);
    setStep("edit");
    update({ ...DEFAULT_SETTINGS, bgMode: transparent ? "off" : "color" });
    void checkApiAvailable().then((available) => setClaude((c) => ({ ...c, available })));
    void checkGatewayAvailable().then((available) => setRedraw((r) => ({ ...r, available })));
  }, [update, dropCandidate]);

  // Turning removal Off on an opaque logo leaves nothing for the fill to show behind: clear it, so
  // it doesn't come back unseen when removal is switched on again.
  const setBgMode = useCallback(
    (bgMode: BgMode) => update(canFillBackground(isTransparent, bgMode !== "off") ? { bgMode } : { bgMode, bgFill: null }),
    [update, isTransparent],
  );
  const setRecolor = useCallback((recolor: string) => update({ recolor }), [update]);
  const setBgFill = useCallback((bgFill: string | null) => update({ bgFill }), [update]);
  const setCustomHex = useCallback((customHex: string) => {
    // A partial hex while typing updates the field but waits to re-render until it is valid.
    if (HEX_RE.test(customHex)) update({ customHex });
    else {
      settingsRef.current = { ...settingsRef.current, customHex };
      setSettings(settingsRef.current);
    }
  }, [update]);

  const addEdits = useCallback((added: NewLogoEdit[]) => {
    const withIds = added.map((e) => ({ ...e, id: `edit-${++editIdRef.current}` }));
    update({ edits: [...settingsRef.current.edits, ...withIds] });
    return withIds;
  }, [update]);

  const updateEdit = useCallback((id: string, patch: { to?: string; box?: BoundingBox | null }) => {
    update({
      edits: settingsRef.current.edits.map((e) => {
        if (e.id !== id) return e;
        // An erase always needs an area; it has no target color.
        if (isErase(e)) return patch.box ? { ...e, box: patch.box } : e;
        return { ...e, ...patch };
      }),
    });
  }, [update]);

  const removeEdit = useCallback((id: string) => {
    update({ edits: settingsRef.current.edits.filter((e) => e.id !== id) });
    setActiveEditId((a) => (a === id ? null : a));
    // Removing the edit whose area is being drawn ends the drawing, hint included.
    if (tool === "box" && activeEditId === id) {
      setTool(null);
      setToolHint(null);
    }
  }, [update, tool, activeEditId]);

  const cancelTool = useCallback(() => {
    setTool(null);
    setToolHint(null);
  }, []);

  const startPick = useCallback(() => {
    setTool("pick");
    setToolHint("Click a color in the processed logo.");
  }, []);

  const startBox = useCallback((id: string) => {
    setActiveEditId(id);
    setBoxFor("edit");
    setTool("box");
    const erasing = settingsRef.current.edits.some((e) => e.id === id && isErase(e));
    setToolHint(erasing ? ERASE_HINT : "Drag over the processed logo to mark the area to change.");
  }, []);

  const startErase = useCallback(() => {
    setActiveEditId(null);
    setBoxFor("erase");
    setTool("box");
    setToolHint(ERASE_HINT);
  }, []);

  /** Pick tool: sample the clicked point (0..1) and add an edit for that color. */
  const pickAt = useCallback((nx: number, ny: number) => {
    const cv = editedRef.current;
    if (!cv) return;
    const rgb = sampleColor(cv, nx, ny);
    if (!rgb) {
      setToolHint("That spot is transparent. Click a visible part of the logo.");
      return;
    }
    const from = snapToPalette(rgb, paletteRef.current, BG_TOLERANCE * 2);
    const [edit] = addEdits([{ from, to: contrastingHex(from), box: null }]);
    setActiveEditId(edit.id);
    setTool(null);
    setToolHint(null);
  }, [addEdits]);

  /** Box tool: set the area of the active edit, or add an erase for that area. */
  const setEditBox = useCallback((box: BoundingBox | null) => {
    if (boxFor === "erase") {
      if (box) {
        const [edit] = addEdits([{ kind: "erase", box }]);
        setActiveEditId(edit.id);
      }
    } else if (activeEditId) {
      updateEdit(activeEditId, { box });
    }
    setBoxFor("edit");
    setTool(null);
    setToolHint(null);
  }, [activeEditId, addEdits, boxFor, updateEdit]);

  const askClaude = useCallback(async (instruction: string) => {
    const cv = editedRef.current;
    if (!cv || !instruction.trim()) return;
    const forImg = imgRef.current;
    setClaude((c) => ({ ...c, busy: true, note: null, error: null }));
    try {
      const s = settingsRef.current;
      // The kept background color, named so Claude can recolor it ("make the background green").
      // Snapped to the palette, since `from` must be a measured color.
      const bg = s.bgMode === "off" && !isTransparent ? currentBackground(bgColorRef.current, s.edits, BG_TOLERANCE * 2) : null;
      const bgHex = bg ? snapToPalette(bg, paletteRef.current, BG_TOLERANCE * 2) : null;
      const res = await requestLogoEdit(cv, instruction.trim(), paletteRef.current, {
        bgRemoved: s.bgMode !== "off",
        bgColor: bgHex && paletteRef.current.some((c) => c.hex === bgHex) ? bgHex : null,
        transparent: isTransparent || s.bgMode !== "off",
        fill: s.bgFill,
      });
      if (imgRef.current !== forImg) return;
      const cur = settingsRef.current;
      let bgMode = cur.bgMode;
      if (!isTransparent && res.background === "remove" && bgMode === "off") bgMode = "color";
      if (!isTransparent && res.background === "keep") bgMode = "off";
      const patch: Partial<LogoSettings> = {};
      if (bgMode !== cur.bgMode) patch.bgMode = bgMode;
      if (res.fill !== null) patch.bgFill = res.fill === "none" ? null : res.fill;
      // Same rule as setBgMode: no fill where it can't show.
      if (!canFillBackground(isTransparent, (patch.bgMode ?? cur.bgMode) !== "off") && (patch.bgFill ?? cur.bgFill)) {
        patch.bgFill = null;
      }
      if (Object.keys(patch).length) update(patch);
      // Claude's boxes are rough; grow each one to whole shapes of its color so letters aren't cut.
      const snapped = res.edits.map((e) => (e.box ? { ...e, box: snapBoxOnCanvas(cv, e.from, e.box, BG_TOLERANCE) } : e));
      // Erase boxes need no snapping: eraseShapes already removes whole shapes.
      const erases: NewLogoEdit[] = res.erase.map((box) => ({ kind: "erase", box }));
      const all: NewLogoEdit[] = [...erases, ...snapped];
      const added = all.length ? addEdits(all) : [];
      if (added.length) setActiveEditId(added[0].id);
      const fallback = added.length || Object.keys(patch).length ? "Done." : "No changes made.";
      setClaude((c) => ({ ...c, busy: false, note: res.note || fallback, error: null }));
    } catch (err) {
      if (imgRef.current !== forImg) return;
      setClaude((c) => ({ ...c, busy: false, note: null, error: errorMessage(err) }));
    }
  }, [addEdits, isTransparent, update]);

  /** Ask the image model to redraw the source logo. The result waits as a candidate. */
  const requestRedraw = useCallback(async (instruction: string) => {
    const img = imgRef.current;
    if (!img || !instruction.trim()) return;
    setRedraw((r) => ({ ...r, busy: true, error: null }));
    try {
      const form = new FormData();
      form.set("purpose", "logo");
      form.set("instruction", instruction.trim());
      form.set("image", await buildRedrawRequest(img, bgColorRef.current), "logo.png");
      const out = await requestImageEdit(form);
      if (imgRef.current !== img) return;
      const canvas = trimRedraw(out, BG_TOLERANCE, bgColorRef.current);
      const url = await canvasToObjectUrl(canvas);
      revokeSrc(candidateRef.current?.url);
      candidateRef.current = { canvas, url };
      setRedraw((r) => ({ ...r, busy: false, candidate: { url, w: canvas.width, h: canvas.height } }));
    } catch (err) {
      if (imgRef.current !== img) return;
      setRedraw((r) => ({ ...r, busy: false, error: errorMessage(err) }));
    }
  }, []);

  /** Make the candidate the new source. Background mode and color changes carry over. */
  const acceptRedraw = useCallback(async () => {
    const cand = candidateRef.current;
    if (!cand) return;
    try {
      const url = await canvasToObjectUrl(cand.canvas);
      const img = await loadImageEl(url);
      const bg = detectBackground(cand.canvas, BG_TOLERANCE);
      const transparent = bg.hasAlpha && bg.color === null;
      renderGen.current++;
      revokeSrc(srcRef.current);
      srcRef.current = url;
      imgRef.current = img;
      bgColorRef.current = bg.color;
      baseCache.current = new Map();
      setSrc(url);
      setNat({ w: cand.canvas.width, h: cand.canvas.height });
      // The model always returns an opaque image; a logo that was transparent now sits on a
      // backdrop, so switch the color key on for it.
      const wasOff = settingsRef.current.bgMode === "off";
      setIsTransparent(transparent);
      dropCandidate();
      update({ bgMode: wasOff && isTransparent && !transparent ? "color" : settingsRef.current.bgMode });
    } catch (err) {
      setRedraw((r) => ({ ...r, error: errorMessage(err) }));
    }
  }, [dropCandidate, isTransparent, update]);

  const getExportCanvas = useCallback((): HTMLCanvasElement | null => finalRef.current, []);

  const reset = useCallback(() => {
    renderGen.current++;
    revokeSrc(previewRef.current);
    revokeSrc(srcRef.current);
    previewRef.current = null;
    srcRef.current = null;
    imgRef.current = null;
    baseCache.current = new Map();
    editedRef.current = null;
    finalRef.current = null;
    settingsRef.current = DEFAULT_SETTINGS;
    setSettings(DEFAULT_SETTINGS);
    setStep("upload");
    setSrc(null);
    setPreview(null);
    setPalette([]);
    setTool(null);
    setToolHint(null);
    setActiveEditId(null);
    setBgStatus({ busy: false, pct: null, error: null });
    setClaude((c) => ({ ...c, busy: false, note: null, error: null }));
    dropCandidate();
    setLoadError(null);
  }, [dropCandidate]);

  return {
    step, src, name, nat, isTransparent,
    bgMode: settings.bgMode, setBgMode, bgStatus,
    recolor: settings.recolor, setRecolor, customHex: settings.customHex, setCustomHex,
    bgFill: settings.bgFill, setBgFill,
    edits: settings.edits, updateEdit, removeEdit, activeEditId, setActiveEditId, palette,
    tool, toolHint, startPick, startBox, startErase, cancelTool, pickAt, setEditBox,
    claude, askClaude, editError, emptyResult,
    redraw, requestRedraw, acceptRedraw, discardRedraw: dropCandidate,
    preview, loadError, clearLoadError: () => setLoadError(null), reportLoadError: setLoadError,
    loadLogo, getExportCanvas, reset,
  };
}
