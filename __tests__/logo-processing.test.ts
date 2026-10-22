import { describe, it, expect, beforeEach } from "vitest";
import { removeBg, recolorCanvas, hasTransparency, detectBackground, fillTransparentPixels, canFillBackground } from "@/lib/logo-processing";

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

  // Also patch drawImage to copy pixel data from source canvas.
  // The mock deliberately overrides the overloaded canvas API, so loose types are intentional here.
  const origDrawImage = ctx.drawImage.bind(ctx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx.drawImage = function(source: any, ...args: any[]): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    origDrawImage.apply(ctx, [source, ...args] as any);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cv.getContext = (contextId: string, ...args: any[]): any => {
      const ctx = origGetContext(contextId, ...args);
      if (!patched && contextId === "2d") {
        patched = true;
        patchCanvas(cv);
      }
      return cv.getContext(contextId, ...args);
    };
    // Re-bind after first patch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  it("removes background-matching pixels everywhere including enclosed areas", () => {
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

    // Inner white pixel at (50, 50) should ALSO be transparent
    // (background-matching pixels inside letters are removed so recolor doesn't fill them)
    const innerIdx = (50 * 100 + 50) * 4;
    expect(data[innerIdx + 3]).toBe(0);

    // Dark border pixel should be preserved (opaque)
    const borderIdx = (30 * 100 + 30) * 4;
    expect(data[borderIdx + 3]).toBeGreaterThan(0);
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


describe("detectBackground", () => {
  it("finds the corner color of a fully opaque image", () => {
    const cv = createTestCanvas(100, 100);
    fillCanvasPixels(cv, 255, 255, 255, 255);
    fillRectPixels(cv, 30, 30, 40, 40, 255, 0, 0, 255);
    const bg = detectBackground(cv, 40);
    expect(bg.hasAlpha).toBe(false);
    expect(bg.color).toEqual([255, 255, 255]);
  });

  it("finds an opaque white box sitting inside a transparent margin", () => {
    // Regression: "transparent" PNG exported with a white rectangle behind the logo
    const cv = createTestCanvas(120, 60);
    fillCanvasPixels(cv, 0, 0, 0, 0);
    fillRectPixels(cv, 20, 10, 80, 40, 255, 255, 255, 255);
    fillRectPixels(cv, 40, 20, 40, 20, 20, 80, 200, 255);
    const bg = detectBackground(cv, 40);
    expect(bg.hasAlpha).toBe(true);
    expect(bg.color).toEqual([255, 255, 255]);
  });

  it("reports no background for a genuinely transparent logo", () => {
    // Blue diamond on transparent: the opaque bbox corners are transparent
    const cv = createTestCanvas(60, 60);
    fillCanvasPixels(cv, 0, 0, 0, 0);
    const ctx = cv.getContext("2d")!;
    const data = ctx.getImageData(0, 0, 60, 60);
    for (let y = 0; y < 60; y++)
      for (let x = 0; x < 60; x++) {
        if (Math.abs(x - 30) + Math.abs(y - 30) <= 20) {
          const i = (y * 60 + x) * 4;
          data.data[i] = 20; data.data[i + 1] = 80; data.data[i + 2] = 200; data.data[i + 3] = 255;
        }
      }
    ctx.putImageData(data, 0, 0);
    const bg = detectBackground(cv, 40);
    expect(bg.hasAlpha).toBe(true);
    expect(bg.color).toBeNull();
  });

  it("reports no background when an opaque box has mismatched corner colors", () => {
    const cv = createTestCanvas(120, 60);
    fillCanvasPixels(cv, 0, 0, 0, 0);
    fillRectPixels(cv, 20, 10, 80, 40, 255, 255, 255, 255);
    fillRectPixels(cv, 20, 10, 10, 10, 200, 0, 0, 255); // one red corner
    expect(detectBackground(cv, 40).color).toBeNull();
  });
});

describe("removeBg with alpha", () => {
  it("removes an opaque white box inside a transparent margin, keeps the logo", () => {
    const cv = createTestCanvas(120, 60);
    fillCanvasPixels(cv, 0, 0, 0, 0);
    fillRectPixels(cv, 20, 10, 80, 40, 255, 255, 255, 255);
    fillRectPixels(cv, 40, 20, 40, 20, 20, 80, 200, 255);
    // semi-transparent blue edge pixel (anti-aliasing) must survive
    fillRectPixels(cv, 39, 30, 1, 1, 20, 80, 200, 90);

    removeBg(cv, 40);
    const data = cv.getContext("2d")!.getImageData(0, 0, 120, 60).data;
    const at = (x: number, y: number) => data[(y * 120 + x) * 4 + 3];
    expect(at(25, 15)).toBe(0); // white box corner
    expect(at(60, 12)).toBe(0); // white box above logo
    expect(at(60, 30)).toBe(255); // logo
    expect(at(39, 30)).toBe(90); // anti-aliased edge kept
  });

  it("leaves a genuinely transparent logo untouched", () => {
    const cv = createTestCanvas(60, 60);
    fillCanvasPixels(cv, 0, 0, 0, 0);
    fillRectPixels(cv, 20, 20, 20, 20, 20, 80, 200, 255);
    fillRectPixels(cv, 10, 10, 5, 5, 20, 80, 200, 255); // second blob so bbox corners are transparent
    const before = Array.from(cv.getContext("2d")!.getImageData(0, 0, 60, 60).data);
    removeBg(cv, 40);
    const after = Array.from(cv.getContext("2d")!.getImageData(0, 0, 60, 60).data);
    expect(after).toEqual(before);
  });
});

describe("removeBg soft edge", () => {
  it("gives blended edge pixels partial alpha and un-blends the background color", () => {
    const cv = createTestCanvas(40, 40);
    fillCanvasPixels(cv, 255, 255, 255, 255);
    fillRectPixels(cv, 10, 10, 20, 20, 20, 80, 200, 255);
    // 25% logo / 75% white anti-aliased pixel on the edge
    fillRectPixels(cv, 9, 20, 1, 1, 196, 211, 241, 255);

    removeBg(cv, 40);
    const data = cv.getContext("2d")!.getImageData(0, 0, 40, 40).data;
    const i = (20 * 40 + 9) * 4;
    expect(data[i + 3]).toBeGreaterThan(0);
    expect(data[i + 3]).toBeLessThan(255);
    // decontaminated color is pulled toward the logo color, away from white
    expect(data[i]).toBeLessThan(196);
    expect(data[i + 2]).toBeGreaterThan(data[i]);
    // solid logo and pure background unchanged
    expect(data[(20 * 40 + 20) * 4 + 3]).toBe(255);
    expect(data[3]).toBe(0);
  });

  it("removes near-background compression noise fully", () => {
    const cv = createTestCanvas(20, 20);
    fillCanvasPixels(cv, 255, 255, 255, 255);
    fillRectPixels(cv, 5, 5, 5, 5, 248, 250, 253, 255);
    removeBg(cv, 40);
    const data = cv.getContext("2d")!.getImageData(0, 0, 20, 20).data;
    expect(data[(7 * 20 + 7) * 4 + 3]).toBe(0);
  });
});

describe("detectBackground: solid icon on transparency", () => {
  it("does not mistake a solid square icon for a background box", () => {
    const cv = createTestCanvas(60, 60);
    fillCanvasPixels(cv, 0, 0, 0, 0);
    fillRectPixels(cv, 10, 10, 40, 40, 2, 44, 18, 255); // solid green square, sharp corners
    const bg = detectBackground(cv, 40);
    expect(bg.hasAlpha).toBe(true);
    expect(bg.color).toBeNull();
  });
});

describe("removeBg: enclosed pale fill", () => {
  it("leaves a light fill enclosed by a dark stroke fully opaque", () => {
    const cv = createTestCanvas(60, 60);
    fillCanvasPixels(cv, 255, 255, 255, 255);
    fillRectPixels(cv, 15, 15, 30, 30, 0, 0, 0, 255); // dark frame
    fillRectPixels(cv, 20, 20, 20, 20, 208, 208, 208, 255); // #D0D0D0 fill, d≈81 from white
    removeBg(cv, 40);
    const d = cv.getContext("2d")!.getImageData(0, 0, 60, 60).data;
    const i = (30 * 60 + 30) * 4;
    expect(d[i + 3]).toBe(255);
    expect([d[i], d[i + 1], d[i + 2]]).toEqual([208, 208, 208]);
    expect(d[3]).toBe(0); // outer white still cleared
  });

  it("still softens a pale edge that touches the background", () => {
    const cv = createTestCanvas(40, 40);
    fillCanvasPixels(cv, 255, 255, 255, 255);
    fillRectPixels(cv, 10, 10, 20, 20, 20, 80, 200, 255);
    fillRectPixels(cv, 9, 20, 1, 1, 196, 211, 241, 255); // blended edge pixel next to white
    removeBg(cv, 40);
    const d = cv.getContext("2d")!.getImageData(0, 0, 40, 40).data;
    const i = (20 * 40 + 9) * 4;
    expect(d[i + 3]).toBeGreaterThan(0);
    expect(d[i + 3]).toBeLessThan(255);
  });
});

describe("fillTransparentPixels", () => {
  it("paints the fill behind transparent pixels, blends edges and leaves opaque pixels alone", () => {
    const px = new Uint8ClampedArray([
      10, 20, 30, 255, // opaque logo pixel
      0, 0, 0, 0, // transparent background
      255, 255, 255, 128, // half-transparent white edge
    ]);
    fillTransparentPixels(px, "#3A4630");
    expect(Array.from(px.slice(0, 4))).toEqual([10, 20, 30, 255]);
    expect(Array.from(px.slice(4, 8))).toEqual([0x3a, 0x46, 0x30, 255]);
    // 128/255 white over #3A4630
    expect(Array.from(px.slice(8, 12))).toEqual([157, 163, 152, 255]);
  });
});

describe("canFillBackground", () => {
  it("allows a fill only where there is something transparent to paint behind", () => {
    expect(canFillBackground(true, false)).toBe(true); // a transparent logo
    expect(canFillBackground(false, true)).toBe(true); // background removed
    expect(canFillBackground(false, false)).toBe(false); // opaque, removal Off: the fill is cleared
  });
});
