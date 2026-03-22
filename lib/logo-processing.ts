export function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}

export function removeBg(canvas: HTMLCanvasElement, tolerance: number): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const w = canvas.width,
    h = canvas.height;

  // Sample background color from corners
  const samples: [number, number, number][] = [];
  for (const [sx, sy] of [
    [0, 0], [w - 5, 0], [0, h - 5], [w - 5, h - 5],
  ] as [number, number][]) {
    for (let dy = 0; dy < 5; dy++)
      for (let dx = 0; dx < 5; dx++) {
        const i = ((sy + dy) * w + (sx + dx)) * 4;
        samples.push([px[i], px[i + 1], px[i + 2]]);
      }
  }
  const bgR = Math.round(samples.reduce((s, c) => s + c[0], 0) / samples.length);
  const bgG = Math.round(samples.reduce((s, c) => s + c[1], 0) / samples.length);
  const bgB = Math.round(samples.reduce((s, c) => s + c[2], 0) / samples.length);

  const tol = tolerance * tolerance * 3;
  const edgeThreshold = 60 * 60 * 3; // edge-strength threshold

  const matchBg = (i: number) => {
    const dr = px[i] - bgR,
      dg = px[i + 1] - bgG,
      db = px[i + 2] - bgB;
    return dr * dr + dg * dg + db * db <= tol;
  };

  // Edge strength: color distance between two adjacent pixels
  const edgeStrength = (i: number, j: number) => {
    const dr = px[i] - px[j],
      dg = px[i + 1] - px[j + 1],
      db = px[i + 2] - px[j + 2];
    return dr * dr + dg * dg + db * db;
  };

  // Pass 1: Mark outer background region (don't remove yet)
  const toRemove = new Uint8Array(w * h);
  const visited = new Uint8Array(w * h);
  const queue: number[] = [];

  // Seed from edges
  for (let x = 0; x < w; x++) {
    queue.push(x);
    queue.push((h - 1) * w + x);
    visited[x] = 1;
    visited[(h - 1) * w + x] = 1;
  }
  for (let y = 1; y < h - 1; y++) {
    queue.push(y * w);
    queue.push(y * w + w - 1);
    visited[y * w] = 1;
    visited[y * w + w - 1] = 1;
  }

  while (queue.length) {
    const idx = queue.pop()!;
    const pi = idx * 4;
    if (matchBg(pi)) {
      toRemove[idx] = 1;
      const x = idx % w,
        y = (idx - x) / w;
      for (const [nx, ny] of [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
      ] as [number, number][]) {
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const ni = ny * w + nx;
          if (!visited[ni]) {
            // Edge-strength check: don't cross strong color boundaries
            const npi = ni * 4;
            if (edgeStrength(pi, npi) < edgeThreshold) {
              visited[ni] = 1;
              queue.push(ni);
            }
          }
        }
      }
    }
  }

  // Pass 2: Apply removal only to marked pixels
  for (let i = 0; i < w * h; i++) {
    if (toRemove[i]) {
      px[i * 4 + 3] = 0;
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

export function canvasToDataURL(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}
