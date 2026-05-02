import { CropRect, NaturalSize, DisplaySize } from "./types";

/**
 * Read a single File as a data URL and decode it as an Image.
 * Resolves to null if the file is empty, the FileReader fails, or the image can't decode.
 * Callers can `Promise.all(files.map(readFileAsImage))` and filter nulls.
 */
export function readFileAsImage(file: File): Promise<{ src: string; name: string; nat: NaturalSize } | null> {
  return new Promise((resolve) => {
    if (!file || file.size === 0) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = (e) => {
      const src = e.target?.result;
      if (typeof src !== "string" || src.length < 32) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        if (!img.width || !img.height) { resolve(null); return; }
        resolve({ src, name: file.name, nat: { w: img.width, h: img.height } });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
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

/**
 * Downscale a data URL to fit within `maxDim` on the longest side and re-encode as JPEG.
 * Used to keep payloads under Anthropic's 5MB inline-image limit while preserving enough
 * detail for focal detection.
 */
export function downscaleForAI(src: string, maxDim = 2048, quality = 0.85): Promise<{ src: string; mime: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const longest = Math.max(img.naturalWidth, img.naturalHeight);
        if (longest <= maxDim && src.startsWith("data:image/jpeg")) {
          resolve({ src, mime: "image/jpeg" });
          return;
        }
        const scale = Math.min(1, maxDim / longest);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = cv.toDataURL("image/jpeg", quality);
        resolve({ src: dataUrl, mime: "image/jpeg" });
      } catch {
        resolve({ src, mime: "image/jpeg" });
      }
    };
    img.onerror = () => resolve({ src, mime: "image/jpeg" });
    img.src = src;
  });
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
