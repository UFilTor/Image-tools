import { MIN_CROP_SIZE } from "./constants";
import { CropRect, BoundingBox, FocalPoint } from "./types";
import type { SafeZone } from "./storefront";

export function clamp(c: CropRect, dw: number, dh: number, r: number | null): CropRect {
  let { x, y, w, h } = c;
  w = Math.max(MIN_CROP_SIZE, Math.min(w, dw));
  if (r !== null) {
    h = w / r;
    if (h > dh) {
      h = dh;
      w = h * r;
    }
  } else {
    h = Math.max(MIN_CROP_SIZE, Math.min(h, dh));
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

/**
 * Crop at ratio `r` around the subject `bbox`, centered on the focal point. With a storefront
 * `safe` zone, the subject must fit inside that centered part of the crop (what every screen
 * shows) instead of anywhere in the crop. Image edges win: a subject at the very edge of the
 * photo can still end up outside the safe zone, because the crop can't leave the image.
 */
export function centeredOnBbox(
  dw: number,
  dh: number,
  r: number | null,
  bbox: BoundingBox | null,
  focalPoint?: FocalPoint | null,
  safe?: SafeZone | null,
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

  // 1. Minimum crop size that contains the bbox (inside the safe zone, when given) at the ratio
  const needW = safe ? bw / safe.w : bw;
  const needH = safe ? bh / safe.h : bh;
  let cw: number;
  let ch: number;

  if (r !== null) {
    cw = Math.max(needW, needH * r);
    ch = cw / r;
    if (ch < needH) {
      ch = needH;
      cw = ch * r;
    }
  } else {
    cw = needW;
    ch = needH;
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

  // 5. Shift to guarantee bbox containment per axis: inside the safe zone when it fits there,
  // otherwise inside the crop (inset 0)
  const insetX = safe && cw * safe.w >= bw ? (cw * (1 - safe.w)) / 2 : 0;
  const insetY = safe && ch * safe.h >= bh ? (ch * (1 - safe.h)) / 2 : 0;
  if (cw >= bw) {
    if (cx + insetX > bx1) cx = bx1 - insetX;
    if (cx + cw - insetX < bx2) cx = bx2 - cw + insetX;
  }
  if (ch >= bh) {
    if (cy + insetY > by1) cy = by1 - insetY;
    if (cy + ch - insetY < by2) cy = by2 - ch + insetY;
  } else if (!focalPoint) {
    // Bbox taller than crop and we have no focal point to center on
    // (FaceDetector path or AI returned no action_point): anchor to bbox
    // top so heads stay visible. With a focal point, the centered cy from
    // step 4 is already what we want.
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
