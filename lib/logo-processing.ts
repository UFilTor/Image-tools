const OPAQUE = 250;

export function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < OPAQUE) return true;
  }
  return false;
}

export interface BackgroundInfo {
  /** Image already has transparent pixels (alpha < 250) */
  hasAlpha: boolean;
  /** Solid background color to remove, or null if none was found */
  color: [number, number, number] | null;
}

/**
 * Find the solid background color of a logo, if any.
 *
 * Samples 5x5 boxes at the corners of the OPAQUE bounding box (not the canvas),
 * so a "transparent" PNG that still carries an opaque white box behind the
 * logo is detected as having a removable background. For fully opaque images
 * this degrades to sampling the canvas corners, matching the old behaviour.
 *
 * Returns color null when the image is genuinely transparent: the opaque
 * region's corners are mostly transparent (irregular shape, not a box) or
 * the corner colors disagree beyond the tolerance.
 */
export function detectBackground(canvas: HTMLCanvasElement, tolerance: number): BackgroundInfo {
  const w = canvas.width,
    h = canvas.height;
  if (w < 8 || h < 8) return { hasAlpha: false, color: null };

  const px = canvas.getContext("2d")!.getImageData(0, 0, w, h).data;

  let hasAlpha = false;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] >= OPAQUE) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        hasAlpha = true;
      }
    }
  }
  if (maxX < 0) return { hasAlpha, color: null };

  const bw = maxX - minX + 1,
    bh = maxY - minY + 1;
  const boxW = Math.min(5, bw),
    boxH = Math.min(5, bh);
  const samples: [number, number, number][] = [];
  let sampled = 0;
  for (const [sx, sy] of [
    [minX, minY], [maxX - boxW + 1, minY], [minX, maxY - boxH + 1], [maxX - boxW + 1, maxY - boxH + 1],
  ] as [number, number][]) {
    for (let dy = 0; dy < boxH; dy++)
      for (let dx = 0; dx < boxW; dx++) {
        const i = ((sy + dy) * w + (sx + dx)) * 4;
        sampled++;
        if (px[i + 3] >= OPAQUE) samples.push([px[i], px[i + 1], px[i + 2]]);
      }
  }

  // Fully opaque image: keep the old behaviour and always offer removal.
  // Image with alpha: only if the opaque region is box-shaped (corners opaque)
  // and those corners agree on one color.
  if (hasAlpha && samples.length < sampled * 0.6) return { hasAlpha, color: null };

  const r = Math.round(samples.reduce((s, c) => s + c[0], 0) / samples.length);
  const g = Math.round(samples.reduce((s, c) => s + c[1], 0) / samples.length);
  const b = Math.round(samples.reduce((s, c) => s + c[2], 0) / samples.length);

  if (hasAlpha) {
    const tol = tolerance * tolerance * 3;
    for (const [cr, cg, cb] of samples) {
      const dr = cr - r, dg = cg - g, db = cb - b;
      if (dr * dr + dg * dg + db * db > tol) return { hasAlpha, color: null };
    }
    // A background box has a logo drawn on it. If nearly every opaque pixel matches the
    // corner color, the opaque region IS the logo (a solid icon on transparency), not a box.
    let opaque = 0, matching = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < OPAQUE) continue;
      opaque++;
      const dr = px[i] - r, dg = px[i + 1] - g, db = px[i + 2] - b;
      if (dr * dr + dg * dg + db * db <= tol) matching++;
    }
    if (opaque && matching / opaque > 0.9) return { hasAlpha, color: null };
  }
  return { hasAlpha, color: [r, g, b] };
}

/**
 * Remove a solid background with a soft alpha ramp.
 *
 * A hard "is this pixel the background color" cut leaves a visible fringe:
 * anti-aliased edge pixels are a blend of logo and background, miss the cut,
 * and stay fully opaque (whitish halo on dark surfaces). Instead, alpha comes
 * from the pixel's color distance `d` to the background:
 *   d <= low          -> transparent (anywhere, so letter holes clear too)
 *   low < d < high    -> alpha ramps 0..1 and the background is un-blended from
 *                        the color (decontamination), but ONLY for pixels connected
 *                        to a background region through other ramp pixels. Pale
 *                        fills enclosed by darker strokes are left untouched.
 *   d >= high         -> untouched
 * Composited back over the original background this reproduces the source;
 * over anything else the edge is a clean anti-aliased edge instead of a halo.
 */
export function removeBg(
  canvas: HTMLCanvasElement,
  tolerance: number,
  /** Pre-detected background color; skips a second detection pass when the caller already has it. */
  knownColor?: [number, number, number] | null,
): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width,
    h = canvas.height;

  // Tiny images can't be reliably analyzed; return as-is.
  if (w < 8 || h < 8) return canvas;

  const color = knownColor !== undefined ? knownColor : detectBackground(canvas, tolerance).color;
  if (!color) return canvas;
  const [bgR, bgG, bgB] = color;

  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Euclidean RGB distance thresholds. With the default tolerance of 40:
  // low = 24 (pure background + compression noise), high = 128.
  const low = tolerance * 0.6;
  const high = tolerance * 3.2;
  const lowSq = low * low;
  const highSq = high * high;
  const range = high - low;

  // Pass 1: classify. 0 = untouched, 1 = background (cleared), 2 = ramp candidate.
  const cls = new Uint8Array(w * h);
  const queue: number[] = [];
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    if (px[i + 3] === 0) continue;
    const dr = px[i] - bgR,
      dg = px[i + 1] - bgG,
      db = px[i + 2] - bgB;
    const dSq = dr * dr + dg * dg + db * db;
    if (dSq >= highSq) continue;
    if (dSq <= lowSq) {
      cls[p] = 1;
      px[i + 3] = 0;
      queue.push(p);
    } else {
      cls[p] = 2;
    }
  }

  // Pass 2: flood from every cleared pixel through ramp candidates; only reached
  // candidates get the soft edge. Already-transparent pixels also carry the fill
  // (a box inside a transparent margin is reached through the margin).
  const visited = new Uint8Array(w * h);
  for (const p of queue) visited[p] = 1;
  while (queue.length) {
    const p = queue.pop()!;
    const x = p % w,
      y = (p - x) / w;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as [number, number][]) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const np = ny * w + nx;
      if (visited[np]) continue;
      const transparent = px[np * 4 + 3] === 0;
      if (cls[np] !== 2 && !transparent) continue;
      visited[np] = 1;
      if (cls[np] === 2) {
        const i = np * 4;
        const dr = px[i] - bgR,
          dg = px[i + 1] - bgG,
          db = px[i + 2] - bgB;
        const s = (Math.sqrt(dr * dr + dg * dg + db * db) - low) / range;
        const k = (1 - s) / s;
        // Un-blend the background: P = s*F + (1-s)*BG  =>  F = (P - (1-s)*BG) / s
        px[i] = Math.max(0, Math.min(255, Math.round(px[i] + dr * k)));
        px[i + 1] = Math.max(0, Math.min(255, Math.round(px[i + 1] + dg * k)));
        px[i + 2] = Math.max(0, Math.min(255, Math.round(px[i + 2] + db * k)));
        px[i + 3] = Math.round(px[i + 3] * s);
      }
      queue.push(np);
    }
  }

  ctx.putImageData(data, 0, 0);
  return canvas;
}

export function recolorCanvas(srcCanvas: HTMLCanvasElement, hexColor: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = srcCanvas.width;
  cv.height = srcCanvas.height;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(srcCanvas, 0, 0);
  const data = ctx.getImageData(0, 0, cv.width, cv.height);
  const px = data.data;
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 0) {
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    }
  }
  ctx.putImageData(data, 0, 0);
  return cv;
}
