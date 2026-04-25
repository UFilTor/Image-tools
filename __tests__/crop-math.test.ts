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
  it("maximizes crop to fill display area", () => {
    const result = centered(400, 300, 1);
    // With ratio 1:1 and 400x300 display, crop should be 300x300 (limited by height)
    expect(result.w).toBeCloseTo(300, 0);
    expect(result.h).toBeCloseTo(300, 0);
    expect(result.x).toBeCloseTo((400 - 300) / 2, 0);
    expect(result.y).toBeCloseTo(0, 0);
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

  it("contains off-center bbox with experience ratio", () => {
    const bbox = { x1: 0.0, y1: 0.0, x2: 0.3, y2: 0.4 };
    const result = centeredOnBbox(1000, 800, 1.4, bbox);
    expect(result.x).toBeLessThanOrEqual(bbox.x1 * 1000);
    expect(result.y).toBeLessThanOrEqual(bbox.y1 * 800);
    expect(result.x + result.w).toBeGreaterThanOrEqual(bbox.x2 * 1000);
    expect(result.y + result.h).toBeGreaterThanOrEqual(bbox.y2 * 800);
  });

  it("focal point shifts crop center while containing bbox", () => {
    const bbox = { x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.8 };
    const focalPoint = { x: 0.3, y: 0.3 };
    const result = centeredOnBbox(1000, 1000, 1, bbox, focalPoint);
    // Crop must contain bbox
    expect(result.x).toBeLessThanOrEqual(bbox.x1 * 1000);
    expect(result.y).toBeLessThanOrEqual(bbox.y1 * 1000);
    expect(result.x + result.w).toBeGreaterThanOrEqual(bbox.x2 * 1000);
    expect(result.y + result.h).toBeGreaterThanOrEqual(bbox.y2 * 1000);
  });

  it("contains large bbox that nearly fills the image", () => {
    const bbox = { x1: 0.05, y1: 0.1, x2: 0.95, y2: 0.9 };
    const result = centeredOnBbox(1000, 800, 1.4, bbox);
    expect(result.x).toBeLessThanOrEqual(bbox.x1 * 1000);
    expect(result.y).toBeLessThanOrEqual(bbox.y1 * 800);
    expect(result.x + result.w).toBeGreaterThanOrEqual(bbox.x2 * 1000);
    expect(result.y + result.h).toBeGreaterThanOrEqual(bbox.y2 * 800);
    // Ratio maintained
    expect(result.w / result.h).toBeCloseTo(1.4, 1);
  });

  it("centers on focal point when bbox is taller than crop", () => {
    // Portrait image 800x1200, Experience ratio 1.4:1
    // Full-body bbox is 960px tall but crop can only be 571px tall.
    // When AI provides a focal point, crop should center on it (not snap to top).
    const bbox = { x1: 0.1, y1: 0.05, x2: 0.9, y2: 0.85 };
    const focalPoint = { x: 0.5, y: 0.3 }; // face / upper torso
    const result = centeredOnBbox(800, 1200, 1.4, bbox, focalPoint);

    expect(result.w / result.h).toBeCloseTo(1.4, 1);

    // Focal point sits roughly at the vertical center of the crop
    const acy = focalPoint.y * 1200;
    const cropCenterY = result.y + result.h / 2;
    expect(Math.abs(cropCenterY - acy)).toBeLessThan(2);
  });

  it("anchors to bbox top when bbox is tall and no focal point provided", () => {
    // FaceDetector / no-AI fallback: no focal point, tall bbox.
    // Should anchor to bbox top so heads/faces stay visible.
    const bbox = { x1: 0.1, y1: 0.05, x2: 0.9, y2: 0.85 };
    const result = centeredOnBbox(800, 1200, 1.4, bbox);

    const bboxTopPx = 0.05 * 1200;
    expect(result.y).toBe(Math.round(bboxTopPx));
  });

  it("centers on action point when action is below the head", () => {
    // Painting workshop scenario: tall person bbox, but the action_point
    // (canvas/hands) sits well below the head. The crop should follow
    // the action, not anchor to the head.
    const bbox = { x1: 0.1, y1: 0.05, x2: 0.9, y2: 0.95 };
    const focalPoint = { x: 0.5, y: 0.65 };
    const result = centeredOnBbox(800, 1200, 1.4, bbox, focalPoint);

    const acy = focalPoint.y * 1200;
    expect(result.y).toBeLessThanOrEqual(acy);
    expect(result.y + result.h).toBeGreaterThanOrEqual(acy);
    // It should not have snapped to the bbox top (which would put action below the crop)
    expect(result.y).toBeGreaterThan(bbox.y1 * 1200);
  });

  it("works without focal point (backward compat)", () => {
    const bbox = { x1: 0.3, y1: 0.2, x2: 0.7, y2: 0.8 };
    const withoutFocal = centeredOnBbox(400, 300, 1, bbox);
    const withUndefined = centeredOnBbox(400, 300, 1, bbox, undefined);
    const withNull = centeredOnBbox(400, 300, 1, bbox, null);
    expect(withoutFocal).toEqual(withUndefined);
    expect(withoutFocal).toEqual(withNull);
  });
});
