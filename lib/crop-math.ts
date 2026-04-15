import { CropRect, BoundingBox, FocalPoint } from "./types";

export function clamp(c: CropRect, dw: number, dh: number, r: number | null): CropRect {
  let { x, y, w, h } = c;
  w = Math.max(60, Math.min(w, dw));
  if (r !== null) {
    h = w / r;
    if (h > dh) {
      h = dh;
      w = h * r;
    }
  } else {
    h = Math.max(60, Math.min(h, dh));
  }
  x = Math.max(0, Math.min(x, dw - w));
  y = Math.max(0, Math.min(y, dh - h));
  return { x, y, w: Math.round(w), h: Math.round(h) };
}

export function centered(dw: number, dh: number, r: number | null): CropRect {
  let cw: number;
  let ch: number;
  if (r !== null) {
    cw = dw;
    ch = cw / r;
    if (ch > dh) {
      ch = dh;
      cw = ch * r;
    }
  } else {
    cw = dw;
    ch = dh;
  }
  return clamp(
    {
      x: Math.round(dw / 2 - cw / 2),
      y: Math.round(dh / 2 - ch / 2),
      w: Math.round(cw),
      h: Math.round(ch),
    },
    dw,
    dh,
    r,
  );
}

export function centeredOnBbox(
  dw: number,
  dh: number,
  r: number | null,
  bbox: BoundingBox | null,
  focalPoint?: FocalPoint | null,
): CropRect {
  if (!bbox) return centered(dw, dh, r);

  const bx1 = bbox.x1 * dw,
    by1 = bbox.y1 * dh,
    bx2 = bbox.x2 * dw,
    by2 = bbox.y2 * dh;
  const bw = bx2 - bx1,
    bh = by2 - by1;

  // Action center: use focal point if provided, otherwise bbox center
  const acx = focalPoint ? focalPoint.x * dw : (bx1 + bx2) / 2;
  const acy = focalPoint ? focalPoint.y * dh : (by1 + by2) / 2;

  // 1. Minimum crop size that contains the bbox at the required ratio
  let cw: number;
  let ch: number;

  if (r !== null) {
    cw = Math.max(bw, bh * r);
    ch = cw / r;
    if (ch < bh) {
      ch = bh;
      cw = ch * r;
    }
  } else {
    cw = bw;
    ch = bh;
  }

  // 2. Expand to fill available image space (show more context)
  let maxCw = dw;
  let maxCh = dh;
  if (r !== null) {
    if (maxCw / r > maxCh) {
      maxCw = maxCh * r;
    } else {
      maxCh = maxCw / r;
    }
  }
  const scale = Math.min(maxCw / cw, maxCh / ch);
  if (scale > 1) {
    cw *= scale;
    ch *= scale;
  }

  // 3. Clamp to image bounds
  if (cw > dw) {
    cw = dw;
    if (r !== null) ch = cw / r;
  }
  if (ch > dh) {
    ch = dh;
    if (r !== null) cw = ch * r;
  }

  // 4. Position centered on action point
  let cx = acx - cw / 2;
  let cy = acy - ch / 2;

  // 5. Shift to guarantee bbox containment per axis
  if (cw >= bw) {
    if (cx > bx1) cx = bx1;
    if (cx + cw < bx2) cx = bx2 - cw;
  }
  if (ch >= bh) {
    if (cy > by1) cy = by1;
    if (cy + ch < by2) cy = by2 - ch;
  } else {
    // Bbox taller than crop (portrait image + wide ratio): anchor to bbox
    // top so heads/faces are always visible. Feet get cropped, not heads.
    cy = by1;
  }

  // 6. Clamp position to image bounds
  cx = Math.max(0, Math.min(cx, dw - cw));
  cy = Math.max(0, Math.min(cy, dh - ch));

  return {
    x: Math.round(cx),
    y: Math.round(cy),
    w: Math.round(cw),
    h: Math.round(ch),
  };
}
