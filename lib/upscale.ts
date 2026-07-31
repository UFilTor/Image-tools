import { UpscaleFactor, NaturalSize } from "./types";

/**
 * Output-size safeguards. Upscaling is tiled so it won't blow WebGL texture limits, but the
 * final PNG is assembled onto one canvas held in memory — a large source at 4x can produce a
 * hundreds-of-megapixel canvas that freezes or crashes the tab. We refuse anything past these
 * caps up front with a clear message instead of attempting it.
 */
export const MAX_OUTPUT_PIXELS = 40_000_000; // ~40 megapixels of output
export const MAX_OUTPUT_SIDE = 10_000; // px, longest side of the output

/**
 * Mode auto-switch. Super-resolution (ESRGAN) only helps when the source is genuinely
 * low-res — above this size its output is near-indistinguishable from a plain resize.
 * Larger images get MAXIM enhancement instead (same dimensions, sharper/cleaner pixels).
 */
export type ProcessMode = "upscale" | "enhance";
export const ENHANCE_THRESHOLD = 1000; // px, longest side of the source

/** Pick the processing mode for a source image: small → upscale, large → enhance. */
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

/**
 * In-browser AI upscaling via UpscalerJS (TensorFlow.js + ESRGAN).
 *
 * Everything here runs client-side: no API key, no server, no per-image cost.
 * TensorFlow.js and the model weights are heavy, so they are loaded lazily via
 * dynamic import() the first time an upscale runs. This keeps them out of the
 * bundle for the Crop / Smart Crop / Logo modes.
 */

// One Upscaler instance per model, created on first use and reused so the model
// weights download only once. Typed loosely to avoid coupling to UpscalerJS internals.
type InstanceKey = "x2" | "x4" | "enhance";
const instances: Partial<Record<InstanceKey, unknown>> = {};

async function getUpscaler(key: InstanceKey): Promise<{
  upscale: (src: string, opts: Record<string, unknown>) => Promise<string>;
}> {
  const existing = instances[key];
  if (existing) return existing as never;

  // Register the WebGL backend, then load the engine + model package.
  // Typed loosely via dynamic import to avoid coupling to UpscalerJS's model types.
  await import("@tensorflow/tfjs");
  const Upscaler = (await import("upscaler")).default as unknown as new (opts: {
    model: unknown;
  }) => { upscale: (src: string, opts: Record<string, unknown>) => Promise<string> };

  // esrgan-medium exports the scale models as named members (x2, x3, x4, x8) on the
  // module namespace — not under `default`. Middle ESRGAN variant: better detail than
  // -slim, much lighter/faster than -thick (which could hang the main thread on big images).
  //
  // Note: "enhance" mode also uses the x2 model (supersample round-trip: upscale 2x, then
  // downscale back to the original size). We tried MAXIM enhancement models here first —
  // they either exceed WebGL texture limits or lock the main thread for minutes, so they
  // are not viable in the browser.
  const models = (await import("@upscalerjs/esrgan-medium")) as unknown as {
    x2: unknown;
    x4: unknown;
  };
  const model = key === "x4" ? models.x4 : models.x2;
  const instance = new Upscaler({ model });
  instances[key] = instance;
  return instance as never;
}

/**
 * Upscale a data URL by the given factor.
 *
 * `patchSize` is required for the progress callback to fire and tiles the work so
 * a large image at 4x does not blow WebGL memory. `padding` hides seams between tiles.
 *
 * Output path: we request a tensor and encode via canvas.toBlob instead of UpscalerJS's
 * default base64 string. Encoding a multi-megapixel PNG to base64 happens synchronously
 * on the main thread and briefly freezes the page ("Page Unresponsive"); toBlob encodes
 * off the main thread in Chrome and an object URL avoids holding a huge base64 string.
 * Returns an object URL (PNG) of the upscaled image.
 */
export async function upscaleImage(
  src: string,
  scale: UpscaleFactor,
  onProgress?: (pct: number) => void,
  mode: ProcessMode = "upscale",
): Promise<string> {
  // Enhance = supersample round-trip: run the 2x model, then downscale back to the
  // source size below. Same dimensions out, sharper and cleaner pixels.
  const upscaler = await getUpscaler(mode === "enhance" || scale === 2 ? "x2" : "x4");
  const tf = await import("@tensorflow/tfjs");

  const tensor = (await upscaler.upscale(src, {
    output: "tensor",
    patchSize: 64,
    padding: 2,
    progress: (rate: number) => onProgress?.(Math.round(rate * 100)),
  })) as unknown as { shape: number[]; dispose: () => void };

  try {
    // Clamp to valid pixel range and render asynchronously into a canvas. Some models
    // return normalized [0,1] output — detect and denormalize so we never render black.
    const maxVal = (await tf.tidy(() =>
      (tensor as unknown as import("@tensorflow/tfjs").Tensor3D).max(),
    ).data())[0];
    const pixels = tf.tidy(() => {
      let t = tensor as unknown as import("@tensorflow/tfjs").Tensor3D;
      if (maxVal <= 1.5) t = t.mul(255);
      return t.clipByValue(0, 255).cast("int32");
    });
    const [h, w] = tensor.shape;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    try {
      await tf.browser.toPixels(pixels as import("@tensorflow/tfjs").Tensor3D, cv);
    } finally {
      pixels.dispose();
    }
    // Enhance mode: downscale the 2x intermediate back to the source size with
    // high-quality resampling. The round-trip yields the same dimensions with
    // sharper edges and less noise than the source.
    let out = cv;
    if (mode === "enhance") {
      const down = document.createElement("canvas");
      down.width = Math.round(w / 2);
      down.height = Math.round(h / 2);
      const ctx = down.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(cv, 0, 0, down.width, down.height);
      out = down;
    }

    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Failed to encode upscaled image");
    return URL.createObjectURL(blob);
  } finally {
    tensor.dispose();
  }
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
