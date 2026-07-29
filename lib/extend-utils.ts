import { NaturalSize } from "./types";

export type FillStyle = "solid" | "blur" | "mirror";

export interface ExtendFill {
  style: FillStyle;
  /** hex color used when style is "solid" */
  color: string;
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
): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = geo.canvasW;
  cv.height = geo.canvasH;
  const ctx = cv.getContext("2d")!;

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
  } else if (fill.style === "mirror") {
    fillMirror(ctx, img, geo);
  }

  // sharp original on top, centered
  ctx.drawImage(img, geo.dx, geo.dy, geo.imgW, geo.imgH);
  return cv;
}

export function extendFilename(name: string): string {
  if (!name) return "extended.png";
  const d = name.lastIndexOf(".");
  return `${d > -1 ? name.slice(0, d) : name}_extended.png`;
}

/** Load a data URL / URL into an HTMLImageElement. */
export function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });
}
