import { describe, it, expect } from "vitest";
import {
  bufferHasAlpha,
  bleedTransparentEdges,
  sharpenInPlace,
  copyAlpha,
  extractRGB,
} from "@/lib/upscale-pixels";

/** Build an RGBA buffer from an array of [r,g,b,a] pixels. */
function rgba(pixels: number[][]): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flat());
}

describe("bufferHasAlpha", () => {
  it("is false for fully opaque buffers", () => {
    expect(bufferHasAlpha(rgba([[10, 20, 30, 255], [0, 0, 0, 255]]))).toBe(false);
  });
  it("is true when any pixel is transparent or semi-transparent", () => {
    expect(bufferHasAlpha(rgba([[10, 20, 30, 255], [0, 0, 0, 0]]))).toBe(true);
    expect(bufferHasAlpha(rgba([[10, 20, 30, 254]]))).toBe(true);
  });
});

describe("bleedTransparentEdges", () => {
  it("copies opaque colors into adjacent fully-transparent pixels", () => {
    // 3x1 strip: opaque red | transparent black | transparent black
    const data = rgba([[200, 0, 0, 255], [0, 0, 0, 0], [0, 0, 0, 0]]);
    bleedTransparentEdges(data, 3, 1);
    expect([data[4], data[5], data[6]]).toEqual([200, 0, 0]);
    expect([data[8], data[9], data[10]]).toEqual([200, 0, 0]);
  });

  it("never modifies alpha values", () => {
    const data = rgba([[200, 0, 0, 255], [0, 0, 0, 0], [0, 0, 0, 128]]);
    bleedTransparentEdges(data, 3, 1);
    expect(data[3]).toBe(255);
    expect(data[7]).toBe(0);
    expect(data[11]).toBe(128);
  });

  it("keeps the RGB of semi-transparent pixels (they are visible)", () => {
    const data = rgba([[200, 0, 0, 255], [0, 90, 0, 10]]);
    bleedTransparentEdges(data, 2, 1);
    expect([data[4], data[5], data[6]]).toEqual([0, 90, 0]);
  });

  it("respects the iteration limit for distant pixels", () => {
    // 4 transparent pixels after an opaque one; 2 iterations reach only 2 of them
    const data = rgba([[100, 100, 100, 255], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    bleedTransparentEdges(data, 5, 1, 2);
    expect(data[8]).toBe(100); // second transparent px filled on iteration 2
    expect(data[12]).toBe(0); // third is beyond the limit
  });
});

describe("sharpenInPlace", () => {
  it("leaves a uniform image unchanged", () => {
    const data = new Uint8ClampedArray(9 * 4).fill(128);
    sharpenInPlace(data, 3, 3, 0.5);
    expect(Array.from(data).every((v) => v === 128)).toBe(true);
  });

  it("increases local contrast at edges", () => {
    // 3x3: bright center on a dark field — sharpening pushes the center brighter
    const px: number[][] = Array.from({ length: 9 }, (_, i) =>
      i === 4 ? [200, 200, 200, 255] : [50, 50, 50, 255],
    );
    const data = rgba(px);
    sharpenInPlace(data, 3, 3, 0.25);
    expect(data[4 * 4]).toBeGreaterThan(200);
  });

  it("does not touch alpha or border pixels", () => {
    const px: number[][] = Array.from({ length: 9 }, (_, i) =>
      i === 4 ? [200, 200, 200, 100] : [50, 50, 50, 255],
    );
    const data = rgba(px);
    sharpenInPlace(data, 3, 3, 0.25);
    expect(data[4 * 4 + 3]).toBe(100); // center alpha untouched
    expect([data[0], data[1], data[2]]).toEqual([50, 50, 50]); // corner untouched
  });
});

describe("copyAlpha", () => {
  it("copies only the alpha channel", () => {
    const target = rgba([[10, 20, 30, 255], [40, 50, 60, 255]]);
    const source = rgba([[0, 0, 0, 128], [0, 0, 0, 0]]);
    copyAlpha(target, source);
    expect(Array.from(target)).toEqual([10, 20, 30, 128, 40, 50, 60, 0]);
  });
});

describe("extractRGB", () => {
  it("drops the alpha channel and keeps pixel order", () => {
    const data = rgba([[1, 2, 3, 255], [4, 5, 6, 0]]);
    expect(Array.from(extractRGB(data))).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
