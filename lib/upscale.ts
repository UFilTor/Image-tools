import { UpscaleFactor, NaturalSize } from "./types";
import { bufferHasAlpha, bleedTransparentEdges, sharpenInPlace, copyAlpha, extractRGB } from "./upscale-pixels";
import type { WorkerRequest, WorkerResponse, WorkerModelKey } from "./upscale.worker";

/**
 * Output-size safeguards. Upscaling is tiled so it won't blow WebGL texture limits, but the
 * final PNG is assembled onto one canvas held in memory — a large source at 4x can produce a
 * hundreds-of-megapixel canvas that freezes or crashes the tab. We refuse anything past these
 * caps up front with a clear message instead of attempting it.
 */
export const MAX_OUTPUT_PIXELS = 40_000_000; // ~40 megapixels of output
export const MAX_OUTPUT_SIDE = 10_000; // px, longest side of the output

/**
 * Tiling settings. UpscalerJS docs: ESRGAN quality degrades at patch edges, and padding 2 is
 * the documented minimum before seams become visible. Bigger patches mean fewer seams, more
 * context per tile, and less per-tile overhead; generous padding hides the remaining seams.
 */
export const PATCH_SIZE = 128;
export const PATCH_PADDING = 8;

/**
 * Mode auto-switch default. Super-resolution helps most when the source is genuinely
 * low-res — above this size the default flips to "enhance" (same dimensions, sharper
 * pixels). It is only a default: each image can be switched between modes afterwards
 * as long as the output fits the size caps.
 */
export type ProcessMode = "upscale" | "enhance";
export const ENHANCE_THRESHOLD = 1000; // px, longest side of the source

/** Pick the default processing mode for a source image: small → upscale, large → enhance. */
export function pickMode(natural: NaturalSize): ProcessMode {
  return Math.max(natural.w, natural.h) >= ENHANCE_THRESHOLD ? "enhance" : "upscale";
}

/**
 * Size guard for enhance mode. Enhancement runs a 2x supersample internally before
 * downscaling back, so the intermediate must fit the same output caps.
 */
export function enhanceSizeError(natural: NaturalSize): string | null {
  return upscaleSizeError(natural, 2)
    ? `Too large to enhance (${natural.w}×${natural.h}). Max is around 10 megapixels.`
    : null;
}

/** Predict the output dimensions for an image at a given scale. */
export function predictUpscaleSize(natural: NaturalSize, scale: UpscaleFactor): NaturalSize {
  return { w: natural.w * scale, h: natural.h * scale };
}

/**
 * Returns a user-facing error message if upscaling this image at this scale would exceed the
 * safe output caps, or null if it's fine to proceed.
 */
export function upscaleSizeError(natural: NaturalSize, scale: UpscaleFactor): string | null {
  const { w, h } = predictUpscaleSize(natural, scale);
  if (w * h > MAX_OUTPUT_PIXELS || w > MAX_OUTPUT_SIDE || h > MAX_OUTPUT_SIDE) {
    const suggestion = scale === 4 ? "Try 2× or a smaller image." : "Try a smaller image.";
    return `Too large for ${scale}× (would be ${w}×${h}). ${suggestion}`;
  }
  return null;
}

/** Size guard for a specific mode — used by the per-image mode toggle. */
export function modeSizeError(natural: NaturalSize, mode: ProcessMode, scale: UpscaleFactor): string | null {
  return mode === "upscale" ? upscaleSizeError(natural, scale) : enhanceSizeError(natural);
}

/**
 * In-browser AI upscaling via UpscalerJS (TensorFlow.js + ESRGAN).
 *
 * Everything runs client-side: no API key, no server, no per-image cost.
 * Inference runs in a web worker so the page stays responsive, which lets
 * genuine upscaling use esrgan-thick (the highest-quality ESRGAN variant —
 * unusable on the main thread, where it freezes the tab). Enhance mode uses
 * esrgan-medium: its sources are much larger and thick would take minutes.
 * If the worker can't start (old browser, bundler issue), we fall back to
 * main-thread esrgan-medium — the pre-worker behavior.
 *
 * Do NOT swap in MAXIM models for enhance: they exceed WebGL texture limits
 * or hard-freeze the main thread in-browser (tested).
 */

interface ModelRunResult {
  // Explicit ArrayBuffer generic: ImageData rejects Uint8ClampedArray<ArrayBufferLike>.
  pixels: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

/* -- Worker path ---------------------------------------------------------- */

let worker: Worker | null = null;
let workerBroken = false;
let nextRequestId = 1;
const pending = new Map<
  number,
  { resolve: (r: ModelRunResult) => void; reject: (e: Error) => void; onProgress?: (pct: number) => void }
>();

function failAllPending(message: string) {
  for (const [, p] of pending) p.reject(new Error(message));
  pending.clear();
}

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./upscale.worker.ts", import.meta.url));
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.type === "progress") {
      p.onProgress?.(msg.pct);
    } else if (msg.type === "done") {
      pending.delete(msg.id);
      p.resolve({ pixels: new Uint8ClampedArray(msg.pixels), width: msg.width, height: msg.height });
    } else {
      pending.delete(msg.id);
      p.reject(new Error(msg.message));
    }
  };
  // Fires when the worker script itself fails to load/parse — mark broken so
  // every future run goes straight to the main-thread fallback.
  worker.onerror = () => {
    workerBroken = true;
    failAllPending("Upscale worker failed to start");
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function runInWorker(
  w: Worker,
  req: Omit<WorkerRequest, "id">,
  onProgress?: (pct: number) => void,
): Promise<ModelRunResult> {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    pending.set(id, { resolve, reject, onProgress });
    // The rgb buffer is cloned (not transferred) so it survives for the
    // main-thread fallback if the worker dies mid-run.
    w.postMessage({ id, ...req } satisfies WorkerRequest);
  });
}

/* -- Main-thread fallback -------------------------------------------------- */

type UpscalerInstance = {
  upscale: (src: unknown, opts: Record<string, unknown>) => Promise<unknown>;
};
const mainInstances: Partial<Record<"x2" | "x4", UpscalerInstance>> = {};

async function getMainUpscaler(key: "x2" | "x4"): Promise<UpscalerInstance> {
  const existing = mainInstances[key];
  if (existing) return existing;

  await import("@tensorflow/tfjs");
  const Upscaler = (await import("upscaler")).default as unknown as new (opts: {
    model: unknown;
  }) => UpscalerInstance;
  // esrgan-medium exports the scale models as named members (x2, x3, x4, x8).
  // Medium (not thick) on the main thread: thick hangs the tab here.
  const models = (await import("@upscalerjs/esrgan-medium")) as unknown as {
    x2: unknown;
    x4: unknown;
  };
  const instance = new Upscaler({ model: key === "x4" ? models.x4 : models.x2 });
  mainInstances[key] = instance;
  return instance;
}

async function runOnMainThread(
  req: Omit<WorkerRequest, "id">,
  onProgress?: (pct: number) => void,
): Promise<ModelRunResult> {
  const tf = await import("@tensorflow/tfjs");
  const { tensorToRGBA } = await import("./upscale-tensor");
  const upscaler = await getMainUpscaler(req.modelKey === "up-x4" ? "x4" : "x2");

  const input = tf.tensor3d(new Uint8Array(req.rgb), [req.height, req.width, 3], "int32");
  let tensor: unknown;
  try {
    tensor = await upscaler.upscale(input, {
      output: "tensor",
      patchSize: req.patchSize,
      padding: req.padding,
      progress: (rate: number, slice?: { dispose?: () => void }) => {
        slice?.dispose?.();
        onProgress?.(Math.round(rate * 100));
      },
    });
  } finally {
    input.dispose();
  }

  const t = tensor as Parameters<typeof tensorToRGBA>[1];
  try {
    return await tensorToRGBA(tf as unknown as Parameters<typeof tensorToRGBA>[0], t);
  } finally {
    t.dispose();
  }
}

async function runModel(
  req: Omit<WorkerRequest, "id">,
  onProgress?: (pct: number) => void,
): Promise<ModelRunResult> {
  const w = getWorker();
  if (w) {
    try {
      return await runInWorker(w, req, onProgress);
    } catch {
      // Worker died or errored — don't trust it again this session.
      workerBroken = true;
    }
  }
  return runOnMainThread(req, onProgress);
}

/* -- Public pipeline ------------------------------------------------------- */

/** Decode a data URL into a canvas so we can read its pixels. */
function decodeToCanvas(src: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Couldn't decode image"));
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      cv.getContext("2d")!.drawImage(img, 0, 0);
      resolve(cv);
    };
    img.src = src;
  });
}

/**
 * Upscale a data URL by the given factor. Returns an object URL (PNG).
 *
 * Output path: raw pixels from the model are assembled on a canvas and encoded
 * via canvas.toBlob, never base64 — encoding a multi-megapixel PNG to base64
 * happens synchronously on the main thread and briefly freezes the page.
 *
 * Transparency: the models are RGB-only, so alpha is upscaled separately
 * (smooth canvas resize) and re-applied. Before inference, opaque colors are
 * bled into transparent regions so the model doesn't sharpen the hidden black
 * matte into halos around edges.
 */
export async function upscaleImage(
  src: string,
  scale: UpscaleFactor,
  onProgress?: (pct: number) => void,
  mode: ProcessMode = "upscale",
): Promise<string> {
  const srcCanvas = await decodeToCanvas(src);
  const w0 = srcCanvas.width;
  const h0 = srcCanvas.height;
  const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true })!;
  const srcData = srcCtx.getImageData(0, 0, w0, h0);

  const hasAlpha = bufferHasAlpha(srcData.data);
  if (hasAlpha) bleedTransparentEdges(srcData.data, w0, h0);

  // Enhance = supersample round-trip: run the 2x model, then downscale back to
  // the source size below. Same dimensions out, sharper and cleaner pixels.
  const modelKey: WorkerModelKey =
    mode === "enhance" ? "enh-x2" : scale === 2 ? "up-x2" : "up-x4";
  const res = await runModel(
    {
      rgb: extractRGB(srcData.data).buffer as ArrayBuffer,
      width: w0,
      height: h0,
      modelKey,
      patchSize: PATCH_SIZE,
      padding: PATCH_PADDING,
    },
    onProgress,
  );

  const cv = document.createElement("canvas");
  cv.width = res.width;
  cv.height = res.height;
  const cvCtx = cv.getContext("2d")!;
  cvCtx.putImageData(new ImageData(res.pixels, res.width, res.height), 0, 0);

  let out = cv;
  if (mode === "enhance") {
    // Downscale the 2x intermediate back to the source size with high-quality
    // resampling, then a mild unsharp mask — the smoothing filter otherwise
    // gives back part of the crispness the model just added.
    const down = document.createElement("canvas");
    down.width = w0;
    down.height = h0;
    const ctx = down.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cv, 0, 0, down.width, down.height);
    const downData = ctx.getImageData(0, 0, down.width, down.height);
    sharpenInPlace(downData.data, down.width, down.height);
    ctx.putImageData(downData, 0, 0);
    out = down;
  }

  if (hasAlpha) {
    // Re-apply transparency: scale the original alpha channel to the output
    // size (bilinear, via drawImage) and copy it onto the result. For enhance
    // mode the dimensions match, so this is the original alpha verbatim.
    const outCtx = out.getContext("2d", { willReadFrequently: true })!;
    const outData = outCtx.getImageData(0, 0, out.width, out.height);
    const alphaCv = document.createElement("canvas");
    alphaCv.width = out.width;
    alphaCv.height = out.height;
    const alphaCtx = alphaCv.getContext("2d", { willReadFrequently: true })!;
    alphaCtx.imageSmoothingEnabled = true;
    alphaCtx.imageSmoothingQuality = "high";
    alphaCtx.drawImage(srcCanvas, 0, 0, out.width, out.height);
    copyAlpha(outData.data, alphaCtx.getImageData(0, 0, out.width, out.height).data);
    outCtx.putImageData(outData, 0, 0);
  }

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Failed to encode upscaled image");
  return URL.createObjectURL(blob);
}

/** Decode a data URL and resolve its pixel dimensions. */
export function measureDataUrl(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = src;
  });
}

/** Build the download filename, e.g. photo.jpg -> photo_4x.png (or photo_enhanced.png) */
export function upscaleFilename(name: string, scale: UpscaleFactor, mode: ProcessMode = "upscale"): string {
  if (mode === "enhance") {
    if (!name) return "enhanced.png";
    const d = name.lastIndexOf(".");
    return `${d > -1 ? name.slice(0, d) : name}_enhanced.png`;
  }
  if (!name) return `upscaled_${scale}x.png`;
  const d = name.lastIndexOf(".");
  return `${d > -1 ? name.slice(0, d) : name}_${scale}x.png`;
}
