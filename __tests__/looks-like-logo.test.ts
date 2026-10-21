import { describe, it, expect } from "vitest";
import { looksLikeLogo } from "@/lib/looks-like-logo";

const W = 200;
const H = 100;

/** Deterministic noise so the photo case never flakes. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function image(fill: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) px.set(fill(x, y), (y * W + x) * 4);
  }
  return px;
}

/** Three dark "letters" on a light background. */
const inLetter = (x: number, y: number) => y > 30 && y < 70 && [[30, 60], [80, 110], [130, 160]].some(([a, b]) => x > a && x < b);

describe("looksLikeLogo", () => {
  it("flags flat colors with hard edges", () => {
    const px = image((x, y) => (inLetter(x, y) ? [26, 62, 32, 255] : [248, 246, 237, 255]));
    expect(looksLikeLogo(px, W, H)).toBe(true);
  });

  it("still flags a logo with slight pixel noise (±2)", () => {
    // Real JPEG logos were checked during calibration (lib/looks-like-logo.ts); independent
    // per-pixel noise is harsher than JPEG's block-smooth noise, so this stays small.
    const r = rng(1);
    const n = () => Math.round((r() - 0.5) * 4);
    const px = image((x, y) => (inLetter(x, y) ? [26 + n(), 62 + n(), 32 + n(), 255] : [248 + n(), 246 + n(), 237 + n(), 255]));
    expect(looksLikeLogo(px, W, H)).toBe(true);
  });

  it("leaves a photo alone: soft gradients and texture everywhere", () => {
    const r = rng(2);
    const px = image((x, y) => {
      const t = () => (r() - 0.5) * 40;
      return [90 + x * 0.6 + t(), 120 + y * 0.8 + t(), 160 - x * 0.3 + t(), 255];
    });
    expect(looksLikeLogo(px, W, H)).toBe(false);
  });

  it("flags a transparent cut-out logo", () => {
    const px = image((x, y) => (inLetter(x, y) ? [147, 63, 41, 255] : [0, 0, 0, 0]));
    expect(looksLikeLogo(px, W, H)).toBe(true);
  });

  it("returns false for a fully transparent image", () => {
    expect(looksLikeLogo(image(() => [0, 0, 0, 0]), W, H)).toBe(false);
  });
});
