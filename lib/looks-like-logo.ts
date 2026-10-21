import { extractPalette } from "./logo-edits";
import { loadImageEl } from "./image-utils";

/** Longest side of the sample. Nearest-neighbour sampling keeps hard edges hard. */
const SAMPLE_SIDE = 384;

/**
 * Logo (or other flat graphic) versus photo, for Upscale's "Redraw instead" hint. Two signals:
 * - flat colors: share of visible pixels in the 8 biggest palette colors (`extractPalette`, tolerance 20)
 * - soft gradients: share of neighbouring pixel pairs that differ a little (6..39 on the largest
 *   channel). Photos are full of them; logos are flat areas with hard edges.
 * Cut-outs (5%+ transparent pixels) get looser limits: their edges are anti-aliased against nothing.
 *
 * Calibrated 2026-10-20 on 54 real images: every logo and flat graphic passes, 1 of 25 photos does.
 * TODO(simplification): fixed thresholds. Ceiling: compressed JPEG logos and dark, flat product photos
 * sit close together (flat-color share 0.856 vs 0.867), so the odd photo gets the hint. Flyers and
 * screenshots count as flat graphics. Upgrade path: ask Claude to classify when the hint matters more.
 */
export function looksLikeLogo(px: Uint8ClampedArray, w: number, h: number): boolean {
  let transparent = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 128) transparent++;
  const cutout = transparent / (w * h) >= 0.05;

  const flatColors = extractPalette(px, 20).reduce((sum, c) => sum + c.share, 0);

  let pairs = 0;
  let soft = 0;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < 128) continue;
      for (const j of [i + 4, i + w * 4]) {
        if (px[j + 3] < 128) continue;
        const d = Math.max(Math.abs(px[i] - px[j]), Math.abs(px[i + 1] - px[j + 1]), Math.abs(px[i + 2] - px[j + 2]));
        pairs++;
        if (d >= 6 && d < 40) soft++;
      }
    }
  }
  if (!pairs) return false;
  const softShare = soft / pairs;
  return cutout ? flatColors >= 0.75 && softShare <= 0.3 : flatColors >= 0.85 && softShare <= 0.25;
}

/** Decode `src` into a small sample and run `looksLikeLogo` on it. Browser only. */
export async function isLogoLike(src: string): Promise<boolean> {
  const img = await loadImageEl(src);
  const s = Math.min(1, SAMPLE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(img.naturalHeight * s));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);
  return looksLikeLogo(ctx.getImageData(0, 0, w, h).data, w, h);
}
