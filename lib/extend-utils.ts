import { NaturalSize } from "./types";
import { MAX_OUTPUT_PIXELS, MAX_OUTPUT_SIDE } from "./upscale";
import { EXTEND_PREVIEW_MAX_SIDE } from "./constants";
import { canvasToBlob } from "./image-utils";

export type FillStyle = "solid" | "blur" | "mirror" | "ai";

export interface ExtendFill {
  style: FillStyle;
  /** hex color used when style is "solid" */
  color: string;
  /** Generated background for style "ai" (whole canvas, any size; it is scaled to fit). Until it exists, "ai" previews as mirror. */
  ai?: CanvasImageSource | null;
}

export interface ExtendGeometry {
  /** final canvas width in native px */
  canvasW: number;
  /** final canvas height in native px */
  canvasH: number;
  /** top-left x where the original image is drawn */
  dx: number;
  /** top-left y where the original image is drawn */
  dy: number;
  /** original image width */
  imgW: number;
  /** original image height */
  imgH: number;
}

/**
 * Compute the extended-canvas geometry for an image.
 * - `paddingFraction` adds a uniform margin of `paddingFraction * max(w, h)` on every side.
 * - `ratio` (w/h) expands the padded box to that aspect ratio; `null` keeps the padded box as-is (Free).
 * The image is always centered in the resulting canvas.
 */
export function extendGeometry(
  nat: NaturalSize,
  ratio: number | null,
  paddingFraction: number,
): ExtendGeometry {
  const w = nat.w;
  const h = nat.h;
  const margin = Math.max(0, paddingFraction) * Math.max(w, h);
  const boxW = w + 2 * margin;
  const boxH = h + 2 * margin;

  let canvasW: number;
  let canvasH: number;
  if (ratio == null) {
    canvasW = boxW;
    canvasH = boxH;
  } else if (boxW / boxH < ratio) {
    // box is too tall for the target ratio: widen it
    canvasH = boxH;
    canvasW = boxH * ratio;
  } else {
    // box is too wide (or exact): heighten it
    canvasW = boxW;
    canvasH = boxW / ratio;
  }

  canvasW = Math.round(canvasW);
  canvasH = Math.round(canvasH);
  const dx = Math.round((canvasW - w) / 2);
  const dy = Math.round((canvasH - h) / 2);

  return { canvasW, canvasH, dx, dy, imgW: w, imgH: h };
}

/** Refuse canvases the browser can't assemble; same caps as Upscale. Returns a user-facing message or null. */
export function extendSizeError(geo: ExtendGeometry): string | null {
  const px = geo.canvasW * geo.canvasH;
  if (geo.canvasW > MAX_OUTPUT_SIDE || geo.canvasH > MAX_OUTPUT_SIDE) {
    return `Output would be ${geo.canvasW}×${geo.canvasH}px, over the ${MAX_OUTPUT_SIDE}px per-side limit. Reduce padding.`;
  }
  if (px > MAX_OUTPUT_PIXELS) {
    return `Output would be ${Math.round(px / 1e6)}MP, over the ${MAX_OUTPUT_PIXELS / 1e6}MP limit. Reduce padding.`;
  }
  return null;
}

/**
 * Scale a geometry down so its longest side fits `maxSide`. The preview renders at this
 * size on every slider tick; full resolution is only rendered on download.
 */
export function previewGeometry(geo: ExtendGeometry, maxSide = EXTEND_PREVIEW_MAX_SIDE): ExtendGeometry {
  const s = Math.min(1, maxSide / Math.max(geo.canvasW, geo.canvasH));
  if (s === 1) return geo;
  return {
    canvasW: Math.max(1, Math.round(geo.canvasW * s)),
    canvasH: Math.max(1, Math.round(geo.canvasH * s)),
    dx: Math.round(geo.dx * s),
    dy: Math.round(geo.dy * s),
    imgW: Math.max(1, Math.round(geo.imgW * s)),
    imgH: Math.max(1, Math.round(geo.imgH * s)),
  };
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  flipX: boolean,
  flipY: boolean,
): void {
  ctx.save();
  ctx.translate(x + (flipX ? w : 0), y + (flipY ? h : 0));
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();
}

/** Tile mirrored reflections of the image across the whole canvas (used as the mirror-fill background). */
function fillMirror(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  geo: ExtendGeometry,
): void {
  const { imgW, imgH, dx, dy, canvasW, canvasH } = geo;
  const cMin = Math.floor((0 - dx) / imgW);
  const cMax = Math.ceil((canvasW - dx) / imgW) - 1;
  const rMin = Math.floor((0 - dy) / imgH);
  const rMax = Math.ceil((canvasH - dy) / imgH) - 1;

  for (let c = cMin; c <= cMax; c++) {
    for (let r = rMin; r <= rMax; r++) {
      const flipX = Math.abs(c) % 2 === 1;
      const flipY = Math.abs(r) % 2 === 1;
      drawTile(ctx, img, dx + c * imgW, dy + r * imgH, imgW, imgH, flipX, flipY);
    }
  }
}

/**
 * Render an extended image onto a fresh canvas. The original image is always drawn sharp
 * and centered on top, so the source is never degraded — only the added margin is filled.
 */
export function renderExtended(
  img: HTMLImageElement,
  geo: ExtendGeometry,
  fill: ExtendFill,
  target?: HTMLCanvasElement,
): HTMLCanvasElement {
  const cv = target ?? document.createElement("canvas");
  cv.width = geo.canvasW;
  cv.height = geo.canvasH;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (fill.style === "solid") {
    ctx.fillStyle = fill.color;
    ctx.fillRect(0, 0, geo.canvasW, geo.canvasH);
  } else if (fill.style === "blur") {
    // scale the image to cover the full canvas, blurred, as a soft background
    const scale = Math.max(geo.canvasW / geo.imgW, geo.canvasH / geo.imgH);
    const cw = geo.imgW * scale;
    const ch = geo.imgH * scale;
    const cx = (geo.canvasW - cw) / 2;
    const cy = (geo.canvasH - ch) / 2;
    const blurPx = Math.max(8, Math.round(Math.max(geo.canvasW, geo.canvasH) * 0.04));
    ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(img, cx, cy, cw, ch);
    ctx.filter = "none";
  } else if (fill.style === "ai" && fill.ai) {
    ctx.drawImage(fill.ai, 0, 0, geo.canvasW, geo.canvasH);
  } else if (fill.style === "mirror" || fill.style === "ai") {
    fillMirror(ctx, img, geo);
  }

  // sharp original on top, centered
  ctx.drawImage(img, geo.dx, geo.dy, geo.imgW, geo.imgH);
  return cv;
}

/** True when the geometry adds no margin, so there is nothing to fill. */
export function hasMargin(geo: ExtendGeometry): boolean {
  return geo.canvasW > geo.imgW || geo.canvasH > geo.imgH;
}

/** Cache key for a generated fill: the same image at the same geometry can reuse it. */
export function aiFillKey(src: string, geo: ExtendGeometry): string {
  return `${src}|${geo.canvasW}x${geo.canvasH}@${geo.dx},${geo.dy}`;
}

/**
 * Image + mask for the fill model, scaled so the long side is `maxSide` (up or down; the model
 * works best around 1-2 MP). The margin is neutral grey in the image and WHITE in the mask
 * (BFL convention: white = generate, black = keep). JPEG for the image keeps the upload well
 * under Vercel's 4.5 MB body limit.
 */
// TODO(simplification): one fixed generation size. Ceiling: on big canvases the generated margin
// is upscaled and looks softer than the original next to it. Upgrade path: generate at a larger
// size (Flux Fill accepts more) or upscale the fill with the Upscale model before compositing.
export async function buildFillRequest(
  img: CanvasImageSource,
  geo: ExtendGeometry,
  maxSide = 1440,
): Promise<{ image: Blob; mask: Blob }> {
  const s = maxSide / Math.max(geo.canvasW, geo.canvasH);
  const w = Math.max(1, Math.round(geo.canvasW * s));
  const h = Math.max(1, Math.round(geo.canvasH * s));
  const dx = Math.round(geo.dx * s), dy = Math.round(geo.dy * s);
  const iw = Math.round(geo.imgW * s), ih = Math.round(geo.imgH * s);

  const image = document.createElement("canvas");
  image.width = w;
  image.height = h;
  const ictx = image.getContext("2d")!;
  ictx.fillStyle = "#808080";
  ictx.fillRect(0, 0, w, h);
  ictx.imageSmoothingQuality = "high";
  ictx.drawImage(img, dx, dy, iw, ih);

  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext("2d")!;
  mctx.fillStyle = "#ffffff";
  mctx.fillRect(0, 0, w, h);
  mctx.fillStyle = "#000000";
  mctx.fillRect(dx, dy, iw, ih);

  return { image: await canvasToBlob(image, "image/jpeg", 0.92), mask: await canvasToBlob(mask, "image/png") };
}

export function extendFilename(name: string): string {
  if (!name) return "extended.png";
  const d = name.lastIndexOf(".");
  return `${d > -1 ? name.slice(0, d) : name}_extended.png`;
}

export { loadImageEl } from "./image-utils";
