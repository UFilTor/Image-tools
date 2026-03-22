import { describe, it, expect } from "vitest";
import { clamp, centered, centeredOnBbox } from "@/lib/crop-math";

describe("clamp", () => {
  it("keeps crop within bounds", () => {
    const result = clamp({ x: -10, y: -10, w: 200, h: 200 }, 400, 300, 1);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });

  it("enforces minimum width of 60", () => {
    const result = clamp({ x: 0, y: 0, w: 10, h: 10 }, 400, 300, 1);
    expect(result.w).toBeGreaterThanOrEqual(60);
  });

  it("maintains aspect ratio", () => {
    const ratio = 16 / 9;
    const result = clamp({ x: 0, y: 0, w: 320, h: 180 }, 400, 300, ratio);
    expect(result.w / result.h).toBeCloseTo(ratio, 1);
  });

  it("constrains to display dimensions", () => {
    const result = clamp({ x: 0, y: 0, w: 800, h: 800 }, 400, 300, 1);
    expect(result.w).toBeLessThanOrEqual(400);
    expect(result.h).toBeLessThanOrEqual(300);
  });

  it("prevents crop from extending past right/bottom edge", () => {
    const result = clamp({ x: 350, y: 250, w: 100, h: 100 }, 400, 300, 1);
    expect(result.x + result.w).toBeLessThanOrEqual(400);
    expect(result.y + result.h).toBeLessThanOrEqual(300);
  });
});

describe("centered", () => {
  it("centers crop at 80% of display area", () => {
    const result = centered(400, 300, 1);
    const expectedW = 300 * 0.8;
    expect(result.w).toBeCloseTo(expectedW, 0);
    expect(result.h).toBeCloseTo(expectedW, 0);
    expect(result.x).toBeCloseTo((400 - expectedW) / 2, 0);
    expect(result.y).toBeCloseTo((300 - expectedW) / 2, 0);
  });

  it("handles wide aspect ratios", () => {
    const ratio = 54 / 17;
    const result = centered(800, 600, ratio);
    expect(result.w / result.h).toBeCloseTo(ratio, 1);
    expect(result.w).toBeLessThanOrEqual(800);
    expect(result.h).toBeLessThanOrEqual(600);
  });
});

describe("centeredOnBbox", () => {
  it("returns centered crop when bbox is null", () => {
    const result = centeredOnBbox(400, 300, 1, null);
    const fallback = centered(400, 300, 1);
    expect(result.x).toBe(fallback.x);
    expect(result.y).toBe(fallback.y);
  });

  it("centers on bounding box", () => {
    const bbox = { x1: 0.3, y1: 0.2, x2: 0.7, y2: 0.8 };
    const result = centeredOnBbox(400, 300, 1, bbox);
    const bboxCenterX = (0.3 + 0.7) / 2 * 400;
    const bboxCenterY = (0.2 + 0.8) / 2 * 300;
    const cropCenterX = result.x + result.w / 2;
    const cropCenterY = result.y + result.h / 2;
    expect(Math.abs(cropCenterX - bboxCenterX)).toBeLessThan(result.w);
    expect(Math.abs(cropCenterY - bboxCenterY)).toBeLessThan(result.h);
  });

  it("contains the entire bounding box", () => {
    const bbox = { x1: 0.2, y1: 0.1, x2: 0.8, y2: 0.9 };
    const result = centeredOnBbox(400, 300, 1, bbox);
    const bx1 = bbox.x1 * 400;
    const by1 = bbox.y1 * 300;
    const bx2 = bbox.x2 * 400;
    const by2 = bbox.y2 * 300;
    expect(result.x).toBeLessThanOrEqual(bx1);
    expect(result.y).toBeLessThanOrEqual(by1);
    expect(result.x + result.w).toBeGreaterThanOrEqual(bx2);
    expect(result.y + result.h).toBeGreaterThanOrEqual(by2);
  });
});
