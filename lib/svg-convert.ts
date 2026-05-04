const SVG_MIME = "image/svg+xml";
const SVG_EXT = ".svg";

/** Check if a file is SVG by MIME or extension. */
export function isSvgFile(file: File): boolean {
  if (file.type === SVG_MIME) return true;
  return file.name.toLowerCase().endsWith(SVG_EXT);
}

const FALLBACK_DIM = 1024;
const MAX_DIM = 4096;

/**
 * Rasterize an SVG file to PNG. Uses intrinsic width/height when present,
 * falls back to a square FALLBACK_DIM for SVGs that only declare a viewBox.
 * Scales up small SVGs so cropping has enough pixels.
 */
async function convertOne(file: File): Promise<File> {
  const text = await file.text();
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  try {
    const png = await new Promise<Blob | null>((resolve) => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (!w || !h) {
            // Try to read viewBox to preserve aspect ratio
            const m = text.match(/viewBox\s*=\s*"([^"]+)"/i);
            if (m) {
              const parts = m[1].split(/[\s,]+/).map(Number);
              if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
                w = parts[2];
                h = parts[3];
              }
            }
          }
          if (!w || !h) {
            w = FALLBACK_DIM;
            h = FALLBACK_DIM;
          }
          // Scale up small SVGs so downstream crops have resolution
          const longest = Math.max(w, h);
          const scale = longest < FALLBACK_DIM ? FALLBACK_DIM / longest : Math.min(1, MAX_DIM / longest);
          const cw = Math.round(w * scale);
          const ch = Math.round(h * scale);
          const cv = document.createElement("canvas");
          cv.width = cw;
          cv.height = ch;
          const ctx = cv.getContext("2d")!;
          ctx.drawImage(img, 0, 0, cw, ch);
          cv.toBlob((b) => resolve(b), "image/png");
        } catch {
          resolve(null);
        }
      };
      img.src = url;
    });
    if (!png) return file;
    const baseName = file.name.replace(/\.svg$/i, "");
    return new File([png], `${baseName}.png`, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Convert any SVG files in the list to PNG; pass others through. */
export async function convertSvgFiles(files: File[]): Promise<FileList> {
  const dt = new DataTransfer();
  for (const file of files) {
    if (isSvgFile(file)) {
      dt.items.add(await convertOne(file));
    } else {
      dt.items.add(file);
    }
  }
  return dt.files;
}
