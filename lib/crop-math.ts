import { CropRect, BoundingBox } from "./types";

export function clamp(c: CropRect, dw: number, dh: number, r: number): CropRect {
  let { x, y, w, h } = c;
  w = Math.max(60, Math.min(w, dw));
  h = w / r;
  if (h > dh) {
    h = dh;
    w = h * r;
  }
  x = Math.max(0, Math.min(x, dw - w));
  y = Math.max(0, Math.min(y, dh - h));
  return { x, y, w: Math.round(w), h: Math.round(h) };
}

export function centered(dw: number, dh: number, r: number): CropRect {
  let cw = dw * 0.8;
  let ch = cw / r;
  if (ch > dh * 0.8) {
    ch = dh * 0.8;
    cw = ch * r;
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
  r: number,
  bbox: BoundingBox | null,
): CropRect {
  if (!bbox) return centered(dw, dh, r);
  const bx1 = bbox.x1 * dw,
    by1 = bbox.y1 * dh,
    bx2 = bbox.x2 * dw,
    by2 = bbox.y2 * dh;
  const bcx = (bx1 + bx2) / 2,
    bcy = (by1 + by2) / 2,
    bw = bx2 - bx1,
    bh = by2 - by1;
  let cw = Math.max(bw, bh * r),
    ch = cw / r;
  if (ch < bh) {
    ch = bh;
    cw = ch * r;
  }
  const mhw = Math.min(bcx, dw - bcx),
    mhh = Math.min(bcy, dh - bcy);
  const ex = Math.min((mhw * 2) / cw, (mhh * 2) / ch);
  if (ex > 1) {
    cw *= ex;
    ch *= ex;
  }
  if (cw > dw) {
    cw = dw;
    ch = cw / r;
  }
  if (ch > dh) {
    ch = dh;
    cw = ch * r;
  }
  return clamp(
    {
      x: Math.round(bcx - cw / 2),
      y: Math.round(bcy - ch / 2),
      w: Math.round(cw),
      h: Math.round(ch),
    },
    dw,
    dh,
    r,
  );
}
