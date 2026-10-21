import type { RGB } from "./logo-edits";
import { canvasToBlob } from "./image-utils";

/**
 * Logo redraw through the AI Gateway (Flux Kontext). Kontext picks its own output frame, at most
 * about 21:9, and crops whatever doesn't fit: a 3:1 logo sent as-is lost its first and last two
 * letters in testing. So the logo is padded onto its own background at a frame Kontext keeps,
 * and the result is trimmed back to the content afterwards.
 */

export const REDRAW_MAX_ASPECT = 21 / 9;

/** Redraw instruction when the goal is only a crisper copy (Upscale's "Redraw in Logo"). */
export const CRISPER_INSTRUCTION = "Keep every letter, shape and color exactly as they are";
/** Neutral backdrop for transparent logos, so white and black parts both stay visible. */
const NEUTRAL: RGB = [128, 128, 128];

/** Frame size for content of size w x h: 12% margin, then widened/heightened into Kontext's range. */
export function redrawFrame(w: number, h: number, longSide = 1024): { fw: number; fh: number; cx: number; cy: number; cw: number; ch: number } {
  const margin = 0.12;
  const s = longSide / Math.max(w, h);
  const cw = Math.round(w * s), ch = Math.round(h * s);
  let fw = cw + 2 * Math.round(margin * Math.max(cw, ch));
  let fh = ch + 2 * Math.round(margin * Math.max(cw, ch));
  if (fw / fh > REDRAW_MAX_ASPECT) fh = Math.round(fw / REDRAW_MAX_ASPECT);
  else if (fh / fw > REDRAW_MAX_ASPECT) fw = Math.round(fh / REDRAW_MAX_ASPECT);
  return { fw, fh, cx: Math.round((fw - cw) / 2), cy: Math.round((fh - ch) / 2), cw, ch };
}

export async function buildRedrawRequest(src: HTMLImageElement | HTMLCanvasElement, bg: RGB | null): Promise<Blob> {
  const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  const f = redrawFrame(w, h);
  const cv = document.createElement("canvas");
  cv.width = f.fw;
  cv.height = f.fh;
  const ctx = cv.getContext("2d")!;
  const [r, g, b] = bg ?? NEUTRAL;
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, f.fw, f.fh);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, f.cx, f.cy, f.cw, f.ch);
  return canvasToBlob(cv, "image/png");
}

/**
 * Bounding box of pixels that differ from the backdrop by more than `tolerance`, on a raw RGBA
 * buffer, ignoring an outer `ring` of pixels. Returns null when nothing stands out. The backdrop
 * defaults to the corner average; pass it when known, because the model degrades its outer edge
 * (Kontext returned corners ~46 units off the real background in testing).
 */
export function contentBounds(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  tolerance: number,
  backdrop?: RGB,
  ring = 0,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const corners = [0, w - 1, (h - 1) * w, h * w - 1];
  const bg = backdrop ?? [0, 1, 2].map((c) => corners.reduce((s, p) => s + px[p * 4 + c], 0) / 4);
  const tolSq = tolerance * tolerance;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = ring; y < h - ring; y++) {
    for (let x = ring; x < w - ring; x++) {
      const i = (y * w + x) * 4;
      const dr = px[i] - bg[0], dg = px[i + 1] - bg[1], db = px[i + 2] - bg[2];
      if (dr * dr + dg * dg + db * db <= tolSq) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * Crop the model output to its content plus a small margin, so the padding added for Kontext
 * goes away. `bg` is the color the logo was padded with (null = the neutral backdrop).
 */
export function trimRedraw(img: HTMLImageElement, tolerance: number, bg: RGB | null, marginFrac = 0.04): HTMLCanvasElement {
  const w = img.naturalWidth, h = img.naturalHeight;
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d")!;
  sctx.drawImage(img, 0, 0);
  const ring = Math.round(0.02 * Math.min(w, h));
  const b = contentBounds(sctx.getImageData(0, 0, w, h).data, w, h, tolerance * 1.5, bg ?? NEUTRAL, ring);
  if (!b) return src;
  const m = Math.round(marginFrac * Math.max(b.x1 - b.x0, b.y1 - b.y0));
  const x0 = Math.max(0, b.x0 - m), y0 = Math.max(0, b.y0 - m);
  const x1 = Math.min(w, b.x1 + 1 + m), y1 = Math.min(h, b.y1 + 1 + m);
  const out = document.createElement("canvas");
  out.width = x1 - x0;
  out.height = y1 - y0;
  out.getContext("2d")!.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
