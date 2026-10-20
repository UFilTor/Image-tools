import { describe, it, expect } from "vitest";
import { REDRAW_MAX_ASPECT, contentBounds, redrawFrame } from "@/lib/logo-redraw";

describe("redrawFrame", () => {
  it("keeps a 3:1 logo inside Kontext's 21:9 limit with a margin on every side", () => {
    const f = redrawFrame(180, 60);
    expect(f.fw / f.fh).toBeLessThanOrEqual(REDRAW_MAX_ASPECT + 1e-9);
    expect(f.cx).toBeGreaterThanOrEqual(0.1 * f.cw);
    expect(f.cy).toBeGreaterThanOrEqual(0.1 * f.cw);
    expect(f.cx + f.cw).toBeLessThanOrEqual(f.fw);
    expect(f.cy + f.ch).toBeLessThanOrEqual(f.fh);
  });

  it("adds height to very wide logos and width to very tall ones", () => {
    const wide = redrawFrame(1000, 100);
    expect(wide.fw / wide.fh).toBeCloseTo(REDRAW_MAX_ASPECT, 2);
    const tall = redrawFrame(100, 1000);
    expect(tall.fh / tall.fw).toBeCloseTo(REDRAW_MAX_ASPECT, 2);
  });
});

describe("contentBounds", () => {
  function scene(white: [number, number][]) {
    const w = 6, h = 4;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) px.set([0, 0, 255, 255], p * 4);
    for (const [x, y] of white) px.set([255, 255, 255, 255], (y * w + x) * 4);
    return px;
  }

  it("finds the box around pixels that differ from the corner color", () => {
    expect(contentBounds(scene([[2, 1], [3, 2]]), 6, 4, 40)).toEqual({ x0: 2, y0: 1, x1: 3, y1: 2 });
  });

  it("uses a known backdrop and skips a degraded outer ring", () => {
    const px = scene([[2, 1]]);
    // Darken the whole border like the model's soft edge
    for (let x = 0; x < 6; x++) for (const y of [0, 3]) px.set([60, 65, 205, 255], (y * 6 + x) * 4);
    for (let y = 0; y < 4; y++) for (const x of [0, 5]) px.set([60, 65, 205, 255], (y * 6 + x) * 4);
    expect(contentBounds(px, 6, 4, 40, [0, 0, 255], 1)).toEqual({ x0: 2, y0: 1, x1: 2, y1: 1 });
  });

  it("returns null for a plain backdrop", () => {
    expect(contentBounds(scene([]), 6, 4, 40)).toBeNull();
  });
});
