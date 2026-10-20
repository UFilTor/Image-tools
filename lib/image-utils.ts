import { CropRect, NaturalSize, DisplaySize } from "./types";
import { EDITOR_INSETS } from "./constants";

export interface LoadedImage {
  /** Object URL for the file. Revoke with `revokeSrc` when the image is discarded. */
  src: string;
  name: string;
  mime: string;
  nat: NaturalSize;
}

/**
 * Wrap a File in an object URL and decode it once to read its dimensions.
 * Object URLs (not data URLs) so a batch of large files doesn't sit in memory as
 * base64 strings and get re-decoded from base64 on every use.
 * Resolves to null if the file is empty or the image can't decode.
 */
export function readFileAsImage(file: File): Promise<LoadedImage | null> {
  return new Promise((resolve) => {
    if (!file || file.size === 0) {
      resolve(null);
      return;
    }
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(src);
      resolve(null);
    };
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        URL.revokeObjectURL(src);
        resolve(null);
        return;
      }
      resolve({ src, name: file.name, mime: file.type, nat: { w: img.naturalWidth, h: img.naturalHeight } });
    };
    img.src = src;
  });
}

/** Release an object URL created by `readFileAsImage` or `canvasToObjectUrl`. Safe on any string. */
export function revokeSrc(src: string | null | undefined): void {
  if (src && src.startsWith("blob:")) URL.revokeObjectURL(src);
}

/** Load any image URL into an HTMLImageElement. */
export function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Couldn't decode image"));
    el.src = src;
  });
}

/** Encode a canvas as a Blob (PNG by default). Encoding runs off the main thread, unlike toDataURL. */
export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode image"))), type, quality);
  });
}

/** Encode a canvas as an object URL (PNG by default). */
export async function canvasToObjectUrl(canvas: HTMLCanvasElement, type = "image/png"): Promise<string> {
  return URL.createObjectURL(await canvasToBlob(canvas, type));
}

export function cropFilename(name: string): string {
  if (!name) return "crop.png";
  const d = name.lastIndexOf(".");
  return `${d > -1 ? name.slice(0, d) : name}_crop.png`;
}

export function dispSize(
  nw: number,
  nh: number,
  maxW: number,
  maxH: number,
): DisplaySize {
  const s = Math.min(maxW / nw, maxH / nh, 1);
  return { dw: Math.round(nw * s), dh: Math.round(nh * s) };
}

/** Display size for the crop editor given the current viewport. */
export function editorDispSize(nat: NaturalSize): DisplaySize {
  const vw = typeof window !== "undefined" ? window.innerWidth - EDITOR_INSETS.x : 800;
  const vh = typeof window !== "undefined" ? window.innerHeight - EDITOR_INSETS.y : 600;
  return dispSize(nat.w, nat.h, Math.min(vw, nat.w), Math.min(vh, nat.h));
}

/** Scale a display-space crop rect when the display size changes (e.g. window resize). */
export function rescaleCrop(crop: CropRect, from: DisplaySize, to: DisplaySize): CropRect {
  if (!from.dw || !from.dh) return crop;
  const sx = to.dw / from.dw;
  const sy = to.dh / from.dh;
  return {
    x: Math.round(crop.x * sx),
    y: Math.round(crop.y * sy),
    w: Math.round(crop.w * sx),
    h: Math.round(crop.h * sy),
  };
}

/** Anthropic's inline-image cap. Anything under it that already fits `maxDim` is sent as-is. */
const AI_MAX_BYTES = 5 * 1024 * 1024;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error("Couldn't read encoded image"));
    r.onload = () => res(r.result as string);
    r.readAsDataURL(blob);
  });
}

/**
 * Prepare an image for the focal-detection API: fit within `maxDim` on the longest side
 * (the vision model works at ~1500px, so more is wasted upload) and stay under the 5 MB
 * inline cap. A JPEG/PNG/WebP that already fits is sent untouched (no decode, no re-encode);
 * everything else is resampled with high-quality smoothing and encoded asynchronously.
 */
export async function downscaleForAI(src: string, maxDim = 2048, quality = 0.85): Promise<{ src: string; mime: string }> {
  const img = await loadImageEl(src);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);

  if (longest <= maxDim && src.startsWith("blob:")) {
    const blob = await fetch(src).then((r) => r.blob());
    if (["image/jpeg", "image/png", "image/webp"].includes(blob.type) && blob.size <= AI_MAX_BYTES) {
      return { src: await blobToDataUrl(blob), mime: blob.type };
    }
  }

  return encodeForAI(img, img.naturalWidth, img.naturalHeight, { maxDim, background: "#ffffff", mime: "image/jpeg", quality });
}

/**
 * Fit `source` within `maxDim`, flatten it onto `background` and encode it as a data URL for an
 * API payload (not as an image source; those stay object URLs).
 */
async function encodeForAI(
  source: CanvasImageSource,
  width: number,
  height: number,
  opts: { maxDim: number; background: string; mime: "image/jpeg" | "image/png"; quality?: number },
): Promise<{ src: string; mime: string }> {
  const scale = Math.min(1, opts.maxDim / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, opts.mime, opts.quality));
  if (!blob) throw new Error("Couldn't encode image for analysis");
  return { src: await blobToDataUrl(blob), mime: opts.mime };
}

/**
 * Prepare a logo for the logo-edit API: PNG so flat colors stay exact, composited on mid grey
 * (not white) so white and black parts both stay visible to the model.
 */
export function logoForAI(canvas: HTMLCanvasElement, maxDim = 1024): Promise<{ src: string; mime: string }> {
  return encodeForAI(canvas, canvas.width, canvas.height, { maxDim, background: "#808080", mime: "image/png" });
}

export function cropToBlob(
  src: string,
  nat: NaturalSize,
  disp: DisplaySize,
  crop: CropRect,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement("canvas");
        const sx = (crop.x / disp.dw) * nat.w;
        const sy = (crop.y / disp.dh) * nat.h;
        const sw = (crop.w / disp.dw) * nat.w;
        const sh = (crop.h / disp.dh) * nat.h;
        cv.width = Math.round(sw);
        cv.height = Math.round(sh);
        cv.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        cv.toBlob(resolve, "image/png");
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
