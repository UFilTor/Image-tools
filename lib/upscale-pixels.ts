/**
 * Pure pixel-buffer operations for the upscale pipeline. No DOM or React imports,
 * so everything here is unit-testable on plain typed arrays.
 */

/** Returns true if any pixel in an RGBA buffer is not fully opaque. */
export function bufferHasAlpha(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

/**
 * Bleed opaque RGB colors outward into fully-transparent pixels, in place.
 *
 * The ESRGAN models see only RGB — transparent pixels usually carry black RGB
 * values, which the model sharpens into dark halos around edges once the alpha
 * channel is re-applied. Flood-filling each transparent pixel with the average
 * color of its nearest visible neighbors gives the model a clean matte instead.
 * Alpha values are never modified. Pixels with any visibility (alpha > 0) keep
 * their own RGB.
 */
export function bleedTransparentEdges(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  iterations = 8,
): void {
  const filled = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) filled[p] = data[p * 4 + 3] > 0 ? 1 : 0;

  for (let iter = 0; iter < iterations; iter++) {
    const frontier: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (filled[p]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        if (x > 0 && filled[p - 1]) { const q = (p - 1) * 4; r += data[q]; g += data[q + 1]; b += data[q + 2]; n++; }
        if (x < w - 1 && filled[p + 1]) { const q = (p + 1) * 4; r += data[q]; g += data[q + 1]; b += data[q + 2]; n++; }
        if (y > 0 && filled[p - w]) { const q = (p - w) * 4; r += data[q]; g += data[q + 1]; b += data[q + 2]; n++; }
        if (y < h - 1 && filled[p + w]) { const q = (p + w) * 4; r += data[q]; g += data[q + 1]; b += data[q + 2]; n++; }
        if (!n) continue;
        const q = p * 4;
        data[q] = r / n;
        data[q + 1] = g / n;
        data[q + 2] = b / n;
        frontier.push(p);
      }
    }
    if (!frontier.length) break;
    for (const p of frontier) filled[p] = 1;
  }
}

/**
 * Mild unsharp mask via a 4-neighbor Laplacian, in place. Used after the
 * enhance-mode downscale, which softens some of what the model sharpened.
 * `amount` 0.2 is a light touch — visible crispness without ringing.
 * Border pixels and the alpha channel are left untouched.
 */
export function sharpenInPlace(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  amount = 0.2,
): void {
  const src = new Uint8ClampedArray(data);
  const rowStride = w * 4;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const q = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const i = q + c;
        const lap = 4 * src[i] - src[i - 4] - src[i + 4] - src[i - rowStride] - src[i + rowStride];
        data[i] = src[i] + amount * lap;
      }
    }
  }
}

/**
 * Copy the alpha channel from one RGBA buffer onto another of the same
 * dimensions, in place. Used to restore transparency after the model
 * (which outputs fully-opaque RGB) has run.
 */
export function copyAlpha(target: Uint8ClampedArray, alphaSource: Uint8ClampedArray): void {
  const len = Math.min(target.length, alphaSource.length);
  for (let i = 3; i < len; i += 4) target[i] = alphaSource[i];
}

/** Extract the RGB channels of an RGBA buffer as a tightly-packed RGB buffer. */
export function extractRGB(data: Uint8ClampedArray): Uint8Array {
  const pixels = data.length / 4;
  const rgb = new Uint8Array(pixels * 3);
  for (let p = 0; p < pixels; p++) {
    rgb[p * 3] = data[p * 4];
    rgb[p * 3 + 1] = data[p * 4 + 1];
    rgb[p * 3 + 2] = data[p * 4 + 2];
  }
  return rgb;
}
