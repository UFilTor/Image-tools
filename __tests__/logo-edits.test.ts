import { describe, it, expect } from "vitest";
import {
  hexToRgb, rgbToHex, normalizeBox, contrastingHex, recolorPixels, extractPalette, snapToPalette, snapBox, eraseShapes, RGB,
} from "@/lib/logo-edits";

/** Build an RGBA buffer from a row-major list of [r, g, b, a] pixels. */
function buf(pixels: [number, number, number, number][]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((p, i) => px.set(p, i * 4));
  return px;
}
const at = (px: Uint8ClampedArray, i: number) => Array.from(px.slice(i * 4, i * 4 + 4));

const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const BLUE: [number, number, number, number] = [0, 0, 255, 255];
const BLACK: RGB = [0, 0, 0];

describe("hex helpers", () => {
  it("round-trips and uppercases", () => {
    expect(hexToRgb("#1a3fd4")).toEqual([26, 63, 212]);
    expect(rgbToHex([26, 63, 212])).toBe("#1A3FD4");
  });

  it("picks white for dark colors and black for light ones", () => {
    expect(contrastingHex("#022C12")).toBe("#FFFFFF");
    expect(contrastingHex("#FFFFFF")).toBe("#000000");
  });
});

describe("normalizeBox", () => {
  it("orders and clamps the corners", () => {
    expect(normalizeBox({ x: 0.8, y: 1.2 }, { x: -0.1, y: 0.3 })).toEqual({ x1: 0, y1: 0.3, x2: 0.8, y2: 1 });
  });

  it("rejects tiny or non-numeric boxes", () => {
    expect(normalizeBox({ x: 0.5, y: 0.5 }, { x: 0.505, y: 0.9 })).toBeNull();
    expect(normalizeBox({ x: NaN, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });
});

describe("recolorPixels", () => {
  it("changes only pixels close to the source color", () => {
    // 4x1: white, white, blue, blue
    const px = buf([WHITE, WHITE, BLUE, BLUE]);
    const n = recolorPixels(px, 4, 1, [255, 255, 255], BLACK, null, 40);
    expect(n).toBe(2);
    expect(at(px, 0)).toEqual([0, 0, 0, 255]);
    expect(at(px, 1)).toEqual([0, 0, 0, 255]);
    expect(at(px, 2)).toEqual([0, 0, 255, 255]);
  });

  it("keeps the same color outside the box untouched", () => {
    // 10x1 all white; box covers the left 30%
    const px = buf(Array.from({ length: 10 }, () => WHITE));
    recolorPixels(px, 10, 1, [255, 255, 255], BLACK, { x1: 0, y1: 0, x2: 0.3, y2: 1 }, 40);
    expect(at(px, 2)).toEqual([0, 0, 0, 255]);
    expect(at(px, 3)).toEqual([255, 255, 255, 255]);
    expect(at(px, 9)).toEqual([255, 255, 255, 255]);
  });

  it("shifts an anti-aliased edge by its blend factor instead of leaving a fringe", () => {
    // white, white, 50% white/blue blend, blue, blue
    const px = buf([WHITE, WHITE, [127, 127, 255, 255], BLUE, BLUE]);
    recolorPixels(px, 5, 1, [255, 255, 255], BLACK, null, 40);
    const [r, g, b] = at(px, 2);
    // A 50% black/blue blend is ~(0, 0, 128)
    expect(r).toBeLessThanOrEqual(2);
    expect(g).toBeLessThanOrEqual(2);
    expect(Math.abs(b - 128)).toBeLessThanOrEqual(3);
    expect(at(px, 3)).toEqual([0, 0, 255, 255]);
  });

  it("leaves a third color next to the target alone", () => {
    const RED: [number, number, number, number] = [220, 20, 20, 255];
    const px = buf([WHITE, WHITE, RED, RED]);
    recolorPixels(px, 4, 1, [255, 255, 255], BLACK, null, 40);
    expect(at(px, 2)).toEqual([220, 20, 20, 255]);
  });

  it("preserves alpha and skips transparent pixels", () => {
    const px = buf([[255, 255, 255, 90], [255, 255, 255, 0], WHITE]);
    recolorPixels(px, 3, 1, [255, 255, 255], BLACK, null, 40);
    expect(at(px, 0)).toEqual([0, 0, 0, 90]);
    expect(at(px, 1)).toEqual([255, 255, 255, 0]);
  });

  it("un-blends a fringe that only borders transparency against the removed background", () => {
    // transparent, light-blue fringe left by keying out blue, white, white
    const px = buf([[0, 0, 255, 0], [177, 185, 255, 255], WHITE, WHITE]);
    recolorPixels(px, 4, 1, [255, 255, 255], BLACK, null, 40, [70, 80, 250]);
    const [r, g, b, a] = at(px, 1);
    expect((r + g + b) / 3).toBeLessThan(120);
    expect(a).toBe(255);
  });

  it("recolors a JPEG-tinted pixel inside a letter", () => {
    // faded edge left by background removal, blue-tinted white (chroma noise), white, white
    const px = buf([[70, 78, 87, 91], [181, 190, 255, 255], [235, 241, 252, 255], [235, 241, 252, 255]]);
    recolorPixels(px, 4, 1, [235, 241, 252], BLACK, null, 40);
    const [r, g, b] = at(px, 1);
    expect((r + g + b) / 3).toBeLessThan(60);
  });

  it("still darkens that fringe somewhat when the background is unknown", () => {
    const px = buf([[0, 0, 255, 0], [177, 185, 255, 255], WHITE, WHITE]);
    recolorPixels(px, 4, 1, [255, 255, 255], BLACK, null, 40);
    const [r, g] = at(px, 1);
    expect(r).toBeLessThan(177);
    expect(g).toBeLessThan(185);
  });

  it("returns 0 when nothing matches", () => {
    const px = buf([BLUE, BLUE]);
    expect(recolorPixels(px, 2, 1, [255, 255, 255], BLACK, null, 40)).toBe(0);
  });
});

describe("extractPalette", () => {
  it("returns dominant visible colors with their shares, noise merged", () => {
    const pixels: [number, number, number, number][] = [];
    for (let i = 0; i < 60; i++) pixels.push(i % 2 ? [250, 252, 255, 255] : WHITE);
    for (let i = 0; i < 40; i++) pixels.push(BLUE);
    for (let i = 0; i < 50; i++) pixels.push([255, 0, 0, 0]); // transparent: ignored
    const pal = extractPalette(buf(pixels), 40);
    expect(pal).toHaveLength(2);
    expect(pal[0].share).toBeCloseTo(0.6, 2);
    expect(pal[1]).toEqual({ hex: "#0000FF", share: 0.4 });
    expect(hexToRgb(pal[0].hex).every((v) => v >= 250)).toBe(true);
  });

  it("is empty for a fully transparent image", () => {
    expect(extractPalette(buf([[0, 0, 0, 0]]), 40)).toEqual([]);
  });
});

describe("snapToPalette", () => {
  const pal = [{ hex: "#FFFFFF", share: 0.6 }, { hex: "#0000FF", share: 0.4 }];

  it("snaps a nearby edge color to the flat color", () => {
    expect(snapToPalette([235, 238, 250], pal, 80)).toBe("#FFFFFF");
  });

  it("keeps a color that is far from every palette entry", () => {
    expect(snapToPalette([200, 30, 30], pal, 80)).toBe("#C81E1E");
  });
});

describe("snapBox", () => {
  // 20x20, all blue. A white "letter" fills cols 1-3, rows 0-5; a separate white shape fills
  // cols 12-16, rows 14-17 (20 px). Results include a 2px margin.
  function scene() {
    const pixels: [number, number, number, number][] = [];
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++) {
        const letter = x >= 1 && x <= 3 && y <= 5;
        const other = x >= 12 && x <= 16 && y >= 14 && y <= 17;
        pixels.push(letter || other ? WHITE : BLUE);
      }
    return buf(pixels);
  }

  it("grows a tight box to the whole shape it cuts through", () => {
    // Box covers rows 0-2 only: the top half of the letter
    const b = snapBox(scene(), 20, 20, [255, 255, 255], { x1: 0.05, y1: 0, x2: 0.2, y2: 0.15 }, 40);
    expect(b.y2).toBeCloseTo((5 + 1 + 2) / 20, 6);
    expect(b.x2).toBeCloseTo((3 + 1 + 2) / 20, 6);
  });

  it("leaves out a same-colored shape the box barely touches", () => {
    // Box reaches col 12 / row 14: 1 of the other shape's 20 px (5%) is inside
    const b = snapBox(scene(), 20, 20, [255, 255, 255], { x1: 0.05, y1: 0, x2: 0.65, y2: 0.75 }, 40);
    expect(b.x2).toBeCloseTo((12 + 1 + 2) / 20, 6);
    expect(b.y2).toBeCloseTo((14 + 1 + 2) / 20, 6);
  });
});

describe("eraseShapes", () => {
  // 20x10 blue background. A white "letter" at cols 1-3, rows 1-5; a black "shark" at
  // cols 8-15, rows 2-8 (8 x 7 = 56 px).
  const BLUE_RGB: RGB = [0, 0, 255];
  function scene() {
    const pixels: [number, number, number, number][] = [];
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 20; x++) {
        if (x >= 1 && x <= 3 && y >= 1 && y <= 5) pixels.push(WHITE);
        else if (x >= 8 && x <= 15 && y >= 2 && y <= 8) pixels.push([0, 0, 0, 255]);
        else pixels.push(BLUE);
      }
    return buf(pixels);
  }
  const px20 = (b: Uint8ClampedArray, x: number, y: number) => at(b, y * 20 + x);

  it("removes the whole shape when a rough box covers most of it, and fills with the background", () => {
    const b = scene();
    // Box covers cols 7-13 (6 of 8 shark columns), rows 1-9
    const n = eraseShapes(b, 20, 10, { x1: 0.35, y1: 0.1, x2: 0.7, y2: 0.95 }, BLUE_RGB, false, 40);
    expect(n).toBe(56);
    expect(px20(b, 15, 8)).toEqual([0, 0, 255, 255]); // part outside the box is gone too
    expect(px20(b, 2, 3)).toEqual([255, 255, 255, 255]); // letter untouched
  });

  it("makes erased shapes transparent when the output is transparent", () => {
    const b = scene();
    eraseShapes(b, 20, 10, { x1: 0.35, y1: 0.1, x2: 0.8, y2: 0.95 }, BLUE_RGB, true, 40);
    expect(px20(b, 10, 5)[3]).toBe(0);
  });

  it("keeps a shape the box only brushes", () => {
    const b = scene();
    // Box covers cols 0-1 only: 1 of the letter's 3 columns (33%, under 40%)
    expect(eraseShapes(b, 20, 10, { x1: 0, y1: 0, x2: 0.1, y2: 1 }, BLUE_RGB, false, 40)).toBe(0);
    expect(px20(b, 1, 3)).toEqual([255, 255, 255, 255]);
  });

  it("erases a shape far larger than the engine's argument limit without throwing", () => {
    const w = 500, h = 500; // one 250,000-pixel shape
    const big = new Uint8Array(w * h * 4);
    for (let p = 0; p < w * h; p++) big.set([0, 0, 0, 255], p * 4);
    const px = new Uint8ClampedArray(big.buffer);
    expect(eraseShapes(px, w, h, { x1: 0, y1: 0, x2: 1, y2: 1 }, null, true, 40)).toBe(w * h);
    expect(px[3]).toBe(0);
  });
});
