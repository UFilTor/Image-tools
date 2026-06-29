import { UpscaleFactor } from "./types";

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
  // esrgan-slim exports the scale models as named members (x2, x3, x4, x8) on the
  // module namespace — not under `default`.
  const models = (await import("@upscalerjs/esrgan-slim")) as unknown as {
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
