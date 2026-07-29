import { describe, it, expect } from "vitest";
import { extendGeometry, extendFilename } from "@/lib/extend-utils";

describe("extendGeometry", () => {
  it("widens a landscape image to a square, centered", () => {
    const geo = extendGeometry({ w: 200, h: 100 }, 1, 0);
    // box is 200x100, wider than 1:1 -> heighten to 200x200
    expect(geo.canvasW).toBe(200);
    expect(geo.canvasH).toBe(200);
    expect(geo.dx).toBe(0);
    expect(geo.dy).toBe(50);
  });

  it("heightens a portrait image to a square, centered", () => {
    const geo = extendGeometry({ w: 100, h: 200 }, 1, 0);
    // box is 100x200, taller than 1:1 -> widen to 200x200
    expect(geo.canvasW).toBe(200);
    expect(geo.canvasH).toBe(200);
    expect(geo.dx).toBe(50);
    expect(geo.dy).toBe(0);
  });

  it("keeps the padded box as-is in Free mode (ratio null)", () => {
    const geo = extendGeometry({ w: 100, h: 100 }, null, 0.1);
    // margin = 0.1 * 100 = 10 -> box 120x120
    expect(geo.canvasW).toBe(120);
    expect(geo.canvasH).toBe(120);
    expect(geo.dx).toBe(10);
    expect(geo.dy).toBe(10);
  });

  it("adds uniform margin via padding on a same-ratio image", () => {
    const geo = extendGeometry({ w: 100, h: 100 }, 1, 0.2);
    // margin = 20 -> box 140x140, already 1:1
    expect(geo.canvasW).toBe(140);
    expect(geo.canvasH).toBe(140);
    expect(geo.dx).toBe(20);
    expect(geo.dy).toBe(20);
  });

  it("expands to a wide ratio using the longer padded side", () => {
    const geo = extendGeometry({ w: 100, h: 100 }, 54 / 17, 0);
    // box 100x100, target ~3.18:1 -> widen to height*ratio
    expect(geo.canvasH).toBe(100);
    expect(geo.canvasW).toBe(Math.round(100 * (54 / 17)));
    expect(geo.dy).toBe(0);
  });

  it("returns the original size when padding is 0 and ratio already matches", () => {
    const geo = extendGeometry({ w: 300, h: 300 }, 1, 0);
    expect(geo.canvasW).toBe(300);
    expect(geo.canvasH).toBe(300);
    expect(geo.dx).toBe(0);
    expect(geo.dy).toBe(0);
  });
});

describe("extendFilename", () => {
  it("appends _extended and forces png", () => {
    expect(extendFilename("photo.jpg")).toBe("photo_extended.png");
  });
  it("handles names without extension", () => {
    expect(extendFilename("banner")).toBe("banner_extended.png");
  });
  it("falls back for empty names", () => {
    expect(extendFilename("")).toBe("extended.png");
  });
});
