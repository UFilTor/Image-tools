import { CropRect, NaturalSize, DisplaySize } from "./types";

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
