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

  const matchBg = (i: number) => {
    const dr = px[i] - bgR,
      dg = px[i + 1] - bgG,
      db = px[i + 2] - bgB;
    return dr * dr + dg * dg + db * db <= tol;
  };

  // Pass 1: Mark outer background region via flood fill from edges.
  // Only queue neighbors that themselves match the background color,
  // so the fill cannot cross dark strokes into enclosed letter areas.
  const toRemove = new Uint8Array(w * h);
  const visited = new Uint8Array(w * h);
  const queue: number[] = [];

  // Seed from edges — only if pixel matches background
  for (let x = 0; x < w; x++) {
    for (const idx of [x, (h - 1) * w + x]) {
      if (!visited[idx]) {
        visited[idx] = 1;
        if (matchBg(idx * 4)) queue.push(idx);
      }
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (const idx of [y * w, y * w + w - 1]) {
      if (!visited[idx]) {
        visited[idx] = 1;
        if (matchBg(idx * 4)) queue.push(idx);
      }
    }
  }

  while (queue.length) {
    const idx = queue.pop()!;
    toRemove[idx] = 1;
    const x = idx % w,
      y = (idx - x) / w;
    for (const [nx, ny] of [
      [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
    ] as [number, number][]) {
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const ni = ny * w + nx;
        if (!visited[ni]) {
          visited[ni] = 1;
          if (matchBg(ni * 4)) {
            queue.push(ni);
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
