import { describe, it, expect, beforeEach } from "vitest";
import { removeBg, recolorCanvas, canvasToDataURL, hasTransparency } from "@/lib/logo-processing";

// The default canvas mock doesn't store pixel data. We patch getImageData/putImageData
// on each canvas context so that pixel-level tests work correctly.
function patchCanvas(cv: HTMLCanvasElement): void {
  const ctx = cv.getContext("2d")!;
  let storedData: ImageData | null = null;

  const origGetImageData = ctx.getImageData.bind(ctx);
  ctx.getImageData = (x: number, y: number, w: number, h: number): ImageData => {
    if (storedData && x === 0 && y === 0 && w === cv.width && h === cv.height) {
      // Return a copy so mutations don't affect stored data directly
      const copy = new ImageData(w, h);
      copy.data.set(storedData.data);
      return copy;
    }
    return origGetImageData(x, y, w, h);
  };

  ctx.putImageData = (data: ImageData, _x: number, _y: number): void => {
    storedData = new ImageData(data.width, data.height);
    storedData.data.set(data.data);
  };

  // Also patch drawImage to copy pixel data from source canvas
  const origDrawImage = ctx.drawImage.bind(ctx);
  ctx.drawImage = (source: any, ...args: any[]): void => {
    origDrawImage(source, ...args);
    if (source instanceof HTMLCanvasElement) {
      const srcCtx = source.getContext("2d")!;
      const srcData = srcCtx.getImageData(0, 0, source.width, source.height);
      storedData = new ImageData(cv.width, cv.height);
      storedData.data.set(srcData.data);
    }
  };
}

// Monkey-patch document.createElement to auto-patch new canvases
const origCreateElement = document.createElement.bind(document);
document.createElement = ((tag: string, options?: ElementCreationOptions): HTMLElement => {
  const el = origCreateElement(tag, options);
  if (tag === "canvas") {
    // Defer patching until dimensions are set -- patch on first getContext
    const cv = el as HTMLCanvasElement;
    const origGetContext = cv.getContext.bind(cv);
    let patched = false;
    cv.getContext = (contextId: string, ...args: any[]): any => {
      const ctx = origGetContext(contextId, ...args);
      if (!patched && contextId === "2d") {
        patched = true;
        patchCanvas(cv);
      }
      return cv.getContext(contextId, ...args);
    };
    // Re-bind after first patch
    cv.getContext = (contextId: string, ...args: any[]): any => {
      const ctx = origGetContext(contextId, ...args);
      if (!patched && contextId === "2d") {
        patched = true;
        patchCanvas(cv);
        return cv.getContext(contextId, ...args);
      }
      return ctx;
    };
  }
  return el;
}) as typeof document.createElement;

function createTestCanvas(width: number, height: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = width;
  cv.height = height;
  patchCanvas(cv);
  return cv;
}

function fillCanvasPixels(
  cv: HTMLCanvasElement,
  r: number,
  g: number,
  b: number,
  a: number = 255,
): void {
  const ctx = cv.getContext("2d")!;
  const data = ctx.getImageData(0, 0, cv.width, cv.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  }
  ctx.putImageData(data, 0, 0);
}

function fillRectPixels(
  cv: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number = 255,
): void {
  const ctx = cv.getContext("2d")!;
  const data = ctx.getImageData(0, 0, cv.width, cv.height);
  const px = data.data;
  for (let py = y; py < y + h && py < cv.height; py++) {
    for (let px2 = x; px2 < x + w && px2 < cv.width; px2++) {
      const i = (py * cv.width + px2) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = a;
    }
  }
  ctx.putImageData(data, 0, 0);
}

describe("hasTransparency", () => {
  it("returns false for fully opaque canvas", () => {
    const cv = createTestCanvas(10, 10);
    fillCanvasPixels(cv, 255, 0, 0, 255);
    expect(hasTransparency(cv)).toBe(false);
  });

  it("returns true for canvas with transparent pixels", () => {
    const cv = createTestCanvas(10, 10);
    fillCanvasPixels(cv, 255, 0, 0, 255);
    // Make top-left quarter transparent
    fillRectPixels(cv, 0, 0, 5, 5, 0, 0, 0, 0);
    expect(hasTransparency(cv)).toBe(true);
  });
});

describe("removeBg (improved)", () => {
  it("preserves enclosed areas that match background color", () => {
    // Create a 100x100 white canvas
    const cv = createTestCanvas(100, 100);
    fillCanvasPixels(cv, 255, 255, 255, 255);
    // Draw a dark rectangle outline (thick border)
    fillRectPixels(cv, 30, 30, 40, 40, 0, 0, 0, 255);
    // Clear the inside to white (enclosed area matching background)
    fillRectPixels(cv, 35, 35, 30, 30, 255, 255, 255, 255);

    removeBg(cv, 40);
    const data = cv.getContext("2d")!.getImageData(0, 0, 100, 100).data;

    // Corner pixel (outer background) should be transparent
    expect(data[3]).toBe(0);

    // Inner white pixel at (50, 50) should be PRESERVED (opaque)
    const innerIdx = (50 * 100 + 50) * 4;
    expect(data[innerIdx + 3]).toBeGreaterThan(0);
  });
});

describe("removeBg", () => {
  it("makes edge-matching pixels transparent", () => {
    const cv = createTestCanvas(100, 100);
    fillCanvasPixels(cv, 255, 255, 255, 255);
    fillRectPixels(cv, 30, 30, 40, 40, 255, 0, 0, 255);

    removeBg(cv, 40);
    const data = cv.getContext("2d")!.getImageData(0, 0, 100, 100).data;
    // Corner pixel (white bg) should be transparent
    expect(data[3]).toBe(0);
    // Center pixel (red foreground) should remain opaque
    const centerIdx = (50 * 100 + 50) * 4;
    expect(data[centerIdx + 3]).toBeGreaterThan(0);
  });
});

describe("recolorCanvas", () => {
  it("changes all visible pixels to target color", () => {
    const cv = createTestCanvas(10, 10);
    fillCanvasPixels(cv, 255, 0, 0, 255);

    const result = recolorCanvas(cv, "#00ff00");
    const data = result.getContext("2d")!.getImageData(0, 0, 10, 10).data;
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(255);
    expect(data[2]).toBe(0);
    expect(data[3]).toBe(255);
  });

  it("preserves transparent pixels", () => {
    const cv = createTestCanvas(10, 10);
    fillCanvasPixels(cv, 255, 0, 0, 255);
    // Make left half transparent
    const ctx = cv.getContext("2d")!;
    const imgData = ctx.getImageData(0, 0, 10, 10);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 5; x++) {
        const i = (y * 10 + x) * 4;
        imgData.data[i + 3] = 0;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const result = recolorCanvas(cv, "#00ff00");
    const data = result.getContext("2d")!.getImageData(0, 0, 10, 10).data;
    // Transparent pixel stays transparent
    expect(data[3]).toBe(0);
    // Opaque pixel gets recolored
    const opaqueIdx = (0 * 10 + 5) * 4;
    expect(data[opaqueIdx]).toBe(0);
    expect(data[opaqueIdx + 1]).toBe(255);
  });
});

describe("canvasToDataURL", () => {
  it("returns a data URL string", () => {
    const cv = createTestCanvas(10, 10);
    const url = canvasToDataURL(cv);
    expect(url).toMatch(/^data:image\/png/);
  });
});
