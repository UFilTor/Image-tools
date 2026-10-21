import { BoundingBox } from "./types";

/**
 * Targeted color edits for the Logo Processor: change one color to another, optionally only
 * inside a box (0..1 image coordinates). The pixel work runs on raw RGBA buffers so it is
 * testable without a real canvas; the canvas helpers at the bottom are thin wrappers.
 */

export type RGB = [number, number, number];

export interface ColorEdit {
  id: string;
  kind?: "recolor";
  /** Color to replace, #RRGGBB */
  from: string;
  /** New color, #RRGGBB */
  to: string;
  /** Limit the change to this area; null means the whole logo. */
  box: BoundingBox | null;
}

/** Remove the whole shapes that lie mostly inside `box` (see eraseShapes). */
export interface EraseEdit {
  id: string;
  kind: "erase";
  box: BoundingBox;
}

export type LogoEdit = ColorEdit | EraseEdit;
/** A new edit before it gets an id. */
export type NewLogoEdit = Omit<ColorEdit, "id"> | Omit<EraseEdit, "id">;

export const isErase = (e: LogoEdit | NewLogoEdit): e is EraseEdit => e.kind === "erase";

export interface PaletteColor {
  hex: string;
  /** Share of visible pixels, 0..1 */
  share: number;
}

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function hexToRgb(hex: string): RGB {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function distSq(a: RGB, b: RGB): number {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Box between two points, ordered and clamped to 0..1; null when it is too small to mean anything. */
export function normalizeBox(
  a: { x: number; y: number },
  b: { x: number; y: number },
  minSize = 0.01,
): BoundingBox | null {
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
  const x1 = clamp01(Math.min(a.x, b.x)), x2 = clamp01(Math.max(a.x, b.x));
  const y1 = clamp01(Math.min(a.y, b.y)), y2 = clamp01(Math.max(a.y, b.y));
  if (x2 - x1 < minSize || y2 - y1 < minSize) return null;
  return { x1, y1, x2, y2 };
}

/** Default target for a freshly picked color: black, or white when the picked color is dark. */
export function contrastingHex(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b < 128 ? "#FFFFFF" : "#000000";
}

/**
 * Shift every pixel close to `from` toward `to`, inside `box` only. Returns the number of
 * pixels changed.
 *
 * Core pixels (RGB distance to `from` <= tolerance) get the full shift P + (to - from), which
 * keeps compression noise and shading instead of flattening them. Anti-aliased edge pixels
 * within 2px of the core are a blend of `from` and a neighbour color O; projecting the pixel
 * onto the O -> from line gives the blend factor s, and the pixel gets s * (to - from). A hard
 * cut would leave a fringe of the old color around every letter. Pixels that sit off that line
 * (a third color) are left alone. Edge pixels with only transparent neighbours (the fringe
 * background removal leaves) are projected against `bgHint`, the removed background color, when
 * it is known; otherwise they shift by how close they are to `from`. Alpha is never touched, so
 * edges softened by background removal stay soft.
 */
export function recolorPixels(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  from: RGB,
  to: RGB,
  box: BoundingBox | null,
  tolerance: number,
  bgHint: RGB | null = null,
): number {
  const bx0 = box ? Math.max(0, Math.floor(box.x1 * w)) : 0;
  const bx1 = box ? Math.min(w, Math.ceil(box.x2 * w)) : w;
  const by0 = box ? Math.max(0, Math.floor(box.y1 * h)) : 0;
  const by1 = box ? Math.min(h, Math.ceil(box.y2 * h)) : h;
  if (bx1 <= bx0 || by1 <= by0) return 0;

  const tolSq = tolerance * tolerance;
  // Fringe pixels farther than this from `from` are treated as a different color.
  const fringeHi = tolerance * 3;
  const R = 2;
  const weight = new Float32Array(w * h);
  const core = new Uint8Array(w * h);
  const rgbAt = (i: number): RGB => [px[i], px[i + 1], px[i + 2]];

  // Pass 1: core pixels.
  let coreCount = 0;
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      const p = y * w + x;
      if (px[p * 4 + 3] === 0) continue;
      if (distSq(rgbAt(p * 4), from) <= tolSq) {
        core[p] = 1;
        weight[p] = 1;
        coreCount++;
      }
    }
  }
  if (!coreCount) return 0;

  // Dilate the core by R (separable max filter) so pass 2 only inspects pixels near it.
  const nearRow = new Uint8Array(w * h);
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      for (let dx = -R; dx <= R; dx++) {
        const nx = x + dx;
        if (nx >= bx0 && nx < bx1 && core[y * w + nx]) {
          nearRow[y * w + x] = 1;
          break;
        }
      }
    }
  }

  // Pass 2: anti-aliased edges next to the core.
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      const p = y * w + x;
      if (core[p] || px[p * 4 + 3] === 0) continue;
      let near = false;
      for (let dy = -R; dy <= R && !near; dy++) {
        const ny = y + dy;
        if (ny >= by0 && ny < by1 && nearRow[ny * w + x]) near = true;
      }
      if (!near) continue;

      // The neighbour farthest from `from` is the color this edge blends into.
      let bestD = -1, oi = -1;
      for (let ny = Math.max(0, y - R); ny <= Math.min(h - 1, y + R); ny++) {
        for (let nx = Math.max(0, x - R); nx <= Math.min(w - 1, x + R); nx++) {
          const j = (ny * w + nx) * 4;
          if (px[j + 3] === 0) continue;
          const d = distSq(rgbAt(j), from);
          if (d > bestD) {
            bestD = d;
            oi = j;
          }
        }
      }
      const i = p * 4;
      // The color this edge blends into: the farthest solid neighbour, or the removed
      // background for an outer edge whose surroundings are now transparent.
      let o: RGB | null = oi >= 0 && oi !== i && bestD > tolSq ? rgbAt(oi) : bgHint;
      if (o && distSq(o, from) <= tolSq) o = null;
      if (!o) {
        // Nothing to blend against: weight by closeness to `from`, so the fringe follows the
        // letters and third colors stay put.
        const d = Math.sqrt(distSq(rgbAt(i), from));
        const s = (fringeHi - d) / (fringeHi - tolerance);
        if (s > 0) weight[p] = Math.min(1, s);
        continue;
      }

      const vr = from[0] - o[0], vg = from[1] - o[1], vb = from[2] - o[2];
      const pr = px[i] - o[0], pg = px[i + 1] - o[1], pb = px[i + 2] - o[2];
      let s = (pr * vr + pg * vg + pb * vb) / (vr * vr + vg * vg + vb * vb);
      if (s <= 0) continue;
      if (s > 1) s = 1;
      const er = pr - s * vr, eg = pg - s * vg, eb = pb - s * vb;
      // 2x tolerance off the line: JPEG chroma noise tints white letters blue by ~45 units,
      // while a genuinely different color sits far further off.
      if (er * er + eg * eg + eb * eb > 4 * tolSq) continue;
      weight[p] = s;
    }
  }

  // Pass 3: apply. Reads in pass 2 saw only original values.
  const dr = to[0] - from[0], dg = to[1] - from[1], db = to[2] - from[2];
  let changed = 0;
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      const p = y * w + x;
      const s = weight[p];
      if (!s) continue;
      const i = p * 4;
      px[i] = Math.round(px[i] + s * dr);
      px[i + 1] = Math.round(px[i + 1] + s * dg);
      px[i + 2] = Math.round(px[i + 2] + s * db);
      changed++;
    }
  }
  return changed;
}

/**
 * Grow a rough box (Claude's estimate) so it covers whole shapes of the `from` color it cuts
 * through. Vision boxes are often a little tight, which would leave the bottom of every letter
 * unchanged. Shapes are 8-connected `from` pixels; a shape joins only when at least `minInside`
 * of it already lies inside the box, so a same-colored shape the box barely touches stays out.
 * The box never shrinks.
 */
export function snapBox(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  from: RGB,
  box: BoundingBox,
  tolerance: number,
  minInside = 0.25,
): BoundingBox {
  const tolSq = tolerance * tolerance;
  const isCore = (p: number) => px[p * 4 + 3] > 0 && distSq([px[p * 4], px[p * 4 + 1], px[p * 4 + 2]], from) <= tolSq;
  const bx0 = Math.max(0, Math.floor(box.x1 * w)), bx1 = Math.min(w, Math.ceil(box.x2 * w));
  const by0 = Math.max(0, Math.floor(box.y1 * h)), by1 = Math.min(h, Math.ceil(box.y2 * h));
  const inBox = (x: number, y: number) => x >= bx0 && x < bx1 && y >= by0 && y < by1;

  let x0 = bx0, y0 = by0, x1 = bx1 - 1, y1 = by1 - 1;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      const start = y * w + x;
      if (seen[start] || !isCore(start)) continue;
      // Walk the whole shape, even the part outside the box.
      let total = 0, inside = 0;
      let cx0 = x, cy0 = y, cx1 = x, cy1 = y;
      seen[start] = 1;
      stack.push(start);
      while (stack.length) {
        const p = stack.pop()!;
        const px0 = p % w, py0 = (p - px0) / w;
        total++;
        if (inBox(px0, py0)) inside++;
        if (px0 < cx0) cx0 = px0;
        if (px0 > cx1) cx1 = px0;
        if (py0 < cy0) cy0 = py0;
        if (py0 > cy1) cy1 = py0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px0 + dx, ny = py0 + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const q = ny * w + nx;
            if (seen[q] || !isCore(q)) continue;
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
      if (inside / total >= minInside) {
        x0 = Math.min(x0, cx0);
        y0 = Math.min(y0, cy0);
        x1 = Math.max(x1, cx1);
        y1 = Math.max(y1, cy1);
      }
    }
  }
  // 2px margin so the anti-aliased edge of the shapes is inside too.
  const m = 2;
  return {
    x1: Math.max(0, x0 - m) / w,
    y1: Math.max(0, y0 - m) / h,
    x2: Math.min(w, x1 + 1 + m) / w,
    y2: Math.min(h, y1 + 1 + m) / h,
  };
}

/**
 * Remove whole shapes, not just a rectangle: every 8-connected shape of foreground pixels with
 * at least `minInside` of its pixels inside `box` is erased completely, even the part outside
 * the box; shapes mostly outside stay. So a rough box around a shark removes the whole shark and
 * leaves the letters it brushes. Foreground = visible (alpha > 0) and, when `bg` is given, farther
 * than `tolerance` from it. Erased pixels become transparent, or `bg` when `transparent` is false.
 * Returns the number of pixels erased.
 */
export function eraseShapes(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  box: BoundingBox,
  bg: RGB | null,
  transparent: boolean,
  tolerance: number,
  minInside = 0.4,
): number {
  const tolSq = tolerance * tolerance;
  const isFg = (p: number) =>
    px[p * 4 + 3] > 0 && (!bg || distSq([px[p * 4], px[p * 4 + 1], px[p * 4 + 2]], bg) > tolSq);
  const bx0 = Math.max(0, Math.floor(box.x1 * w)), bx1 = Math.min(w, Math.ceil(box.x2 * w));
  const by0 = Math.max(0, Math.floor(box.y1 * h)), by1 = Math.min(h, Math.ceil(box.y2 * h));

  const seen = new Uint8Array(w * h);
  // A mark per pixel, not an array of indexes: spreading a big shape into push() throws
  // RangeError past ~125k arguments (a 400x400 icon is 160k pixels).
  const kill = new Uint8Array(w * h);
  let erased = 0;
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      const start = y * w + x;
      if (seen[start] || !isFg(start)) continue;
      const shape: number[] = [];
      let inside = 0;
      seen[start] = 1;
      const stack = [start];
      while (stack.length) {
        const p = stack.pop()!;
        shape.push(p);
        const sx = p % w, sy = (p - sx) / w;
        if (sx >= bx0 && sx < bx1 && sy >= by0 && sy < by1) inside++;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = sx + dx, ny = sy + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const q = ny * w + nx;
            if (seen[q] || !isFg(q)) continue;
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
      if (inside / shape.length >= minInside) {
        for (const p of shape) kill[p] = 1;
        erased += shape.length;
      }
    }
  }

  for (let p = 0; p < kill.length; p++) {
    if (!kill[p]) continue;
    const i = p * 4;
    if (transparent || !bg) {
      px[i + 3] = 0;
    } else {
      px[i] = bg[0];
      px[i + 1] = bg[1];
      px[i + 2] = bg[2];
      px[i + 3] = 255;
    }
  }
  return erased;
}

/**
 * Dominant colors of the visible pixels (alpha >= 128), biggest first. Pixels are bucketed at
 * 4 bits per channel, then buckets within `tolerance` of a bigger color merge into it, so
 * anti-aliasing and compression noise fold into the flat colors they came from.
 */
export function extractPalette(
  px: Uint8ClampedArray,
  tolerance: number,
  max = 8,
  minShare = 0.005,
): PaletteColor[] {
  const n = px.length / 4;
  // TODO(simplification): samples at most ~250k pixels. Ceiling: a color covering well under
  // minShare can be missed on huge logos. Upgrade path: full pass in a worker if that matters.
  const step = Math.max(1, Math.floor(n / 250_000));
  const count = new Uint32Array(4096);
  const sum = new Float64Array(4096 * 3);
  let total = 0;
  for (let p = 0; p < n; p += step) {
    const i = p * 4;
    if (px[i + 3] < 128) continue;
    const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    count[k]++;
    sum[k * 3] += px[i];
    sum[k * 3 + 1] += px[i + 1];
    sum[k * 3 + 2] += px[i + 2];
    total++;
  }
  if (!total) return [];

  const buckets: number[] = [];
  for (let k = 0; k < 4096; k++) if (count[k]) buckets.push(k);
  buckets.sort((a, b) => count[b] - count[a]);

  const tolSq = tolerance * tolerance;
  const merged: { rgb: RGB; c: number }[] = [];
  for (const k of buckets) {
    const c = count[k];
    const mean: RGB = [sum[k * 3] / c, sum[k * 3 + 1] / c, sum[k * 3 + 2] / c];
    const into = merged.find((m) => distSq(m.rgb, mean) <= tolSq);
    if (into) {
      const t = into.c + c;
      into.rgb = [
        (into.rgb[0] * into.c + mean[0] * c) / t,
        (into.rgb[1] * into.c + mean[1] * c) / t,
        (into.rgb[2] * into.c + mean[2] * c) / t,
      ];
      into.c = t;
    } else {
      merged.push({ rgb: mean, c });
    }
  }

  return merged
    .filter((m) => m.c / total >= minShare)
    .sort((a, b) => b.c - a.c)
    .slice(0, max)
    .map((m) => ({
      hex: rgbToHex([Math.round(m.rgb[0]), Math.round(m.rgb[1]), Math.round(m.rgb[2])]),
      share: m.c / total,
    }));
}

/**
 * Snap a sampled color to the nearest palette color when it is close, so a click on an
 * anti-aliased edge still picks the flat color the user meant.
 */
export function snapToPalette(rgb: RGB, palette: PaletteColor[], maxDist: number): string {
  let best: PaletteColor | null = null;
  let bestD = maxDist * maxDist;
  for (const c of palette) {
    const d = distSq(rgb, hexToRgb(c.hex));
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best ? best.hex : rgbToHex(rgb);
}

/**
 * The kept background color after color edits: a whole-logo edit from (about) the background
 * color moves the background to its `to` color. Erases then paint the new color, and Ask AI's
 * background hint names the color the background has now.
 */
export function currentBackground(bg: RGB | null, edits: LogoEdit[], maxDist: number): RGB | null {
  let cur = bg;
  for (const e of edits) {
    if (cur && !isErase(e) && !e.box && distSq(cur, hexToRgb(e.from)) <= maxDist * maxDist) cur = hexToRgb(e.to);
  }
  return cur;
}

// ---- Canvas wrappers ----

export interface EditContext {
  /** Background color that was keyed out, if any; sharpens recoloring of the leftover fringe. */
  bgHint: RGB | null;
  /** Background color erased shapes are filled with when the output keeps its background. */
  bg: RGB | null;
  /** The output has a transparent background, so erased shapes become transparent. */
  transparent: boolean;
}

/** Apply edits in order (each sees the previous one's result). Returns `src` when nothing applies. */
export function applyEdits(
  src: HTMLCanvasElement,
  edits: LogoEdit[],
  tolerance: number,
  context: EditContext = { bgHint: null, bg: null, transparent: true },
): HTMLCanvasElement {
  const valid = edits.filter(
    (e) => isErase(e) || (HEX_RE.test(e.from) && HEX_RE.test(e.to) && e.from.toUpperCase() !== e.to.toUpperCase()),
  );
  if (!valid.length) return src;
  const cv = document.createElement("canvas");
  cv.width = src.width;
  cv.height = src.height;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, cv.width, cv.height);
  for (const e of valid) {
    if (isErase(e)) eraseShapes(data.data, cv.width, cv.height, e.box, context.bg, context.transparent, tolerance);
    else recolorPixels(data.data, cv.width, cv.height, hexToRgb(e.from), hexToRgb(e.to), e.box, tolerance, context.bgHint);
  }
  ctx.putImageData(data, 0, 0);
  return cv;
}

/** `snapBox` on a canvas's pixels. */
export function snapBoxOnCanvas(canvas: HTMLCanvasElement, from: string, box: BoundingBox, tolerance: number): BoundingBox {
  const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
  return snapBox(data.data, canvas.width, canvas.height, hexToRgb(from), box, tolerance);
}

export function canvasPalette(canvas: HTMLCanvasElement, tolerance: number): PaletteColor[] {
  const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
  return extractPalette(data.data, tolerance);
}

/** Color at a 0..1 point, or null when that pixel is (mostly) transparent. */
export function sampleColor(canvas: HTMLCanvasElement, nx: number, ny: number): RGB | null {
  const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(nx * canvas.width)));
  const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(ny * canvas.height)));
  const d = canvas.getContext("2d")!.getImageData(x, y, 1, 1).data;
  return d[3] < 128 ? null : [d[0], d[1], d[2]];
}
