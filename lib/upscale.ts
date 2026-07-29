import { UpscaleFactor, NaturalSize } from "./types";

/**
 * Output-size safeguards. Upscaling is tiled so it won't blow WebGL texture limits, but the
 * final PNG is assembled onto one canvas held in memory — a large source at 4x can produce a
 * hundreds-of-megapixel canvas that freezes or crashes the tab. We refuse anything past these
 * caps up front with a clear message instead of attempting it.
 */
export const MAX_OUTPUT_PIXELS = 40_000_000; // ~40 megapixels of output
export const MAX_OUTPUT_SIDE = 10_000; // px, longest side of the output

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

// One Upscaler instance per scale, created on first use and reused so the model
// weights download only once. Typed loosely to avoid coupling to UpscalerJS internals.
const instances: Partial<Record<UpscaleFactor, unknown>> = {};

async function getUpscaler(scale: UpscaleFactor): Promise<{
  upscale: (src: string, opts: Record<string, unknown>) => Promise<string>;
}> {
  const existing = instances[scale];
  if (existing) return existing as never;

  // Register the WebGL backend, then load the engine + model package.
  // Typed loosely via dynamic import to avoid coupling to UpscalerJS's model types.
  await import("@tensorflow/tfjs");
  const Upscaler = (await import("upscaler")).default as unknown as new (opts: {
    model: unknown;
  }) => { upscale: (src: string, opts: Record<string, unknown>) => Promise<string> };
  // esrgan-thick exports the scale models as named members (x2, x3, x4, x8) on the
  // module namespace — not under `default`. It's the highest-quality ESRGAN variant
  // (larger download + slower compute than -slim/-medium, better detail recovery).
  const models = (await import("@upscalerjs/esrgan-thick")) as unknown as {
    x2: unknown;
    x4: unknown;
  };
  const model = scale === 2 ? models.x2 : models.x4;
  const instance = new Upscaler({ model });
  instances[scale] = instance;
  return instance as never;
}

/**
 * Upscale a data URL by the given factor.
 *
 * `patchSize` is required for the progress callback to fire and tiles the work so
 * a large image at 4x does not blow WebGL memory. `padding` hides seams between tiles.
 * Returns a base64 data URL (PNG) of the upscaled image.
 */
export async function upscaleImage(
  src: string,
  scale: UpscaleFactor,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const upscaler = await getUpscaler(scale);
  return upscaler.upscale(src, {
    patchSize: 64,
    padding: 2,
    progress: (rate: number) => onProgress?.(Math.round(rate * 100)),
  });
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

/** Build the download filename for an upscaled image, e.g. photo.jpg -> photo_4x.png */
export function upscaleFilename(name: string, scale: UpscaleFactor): string {
  if (!name) return `upscaled_${scale}x.png`;
  const d = name.lastIndexOf(".");
  return `${d > -1 ? name.slice(0, d) : name}_${scale}x.png`;
}
