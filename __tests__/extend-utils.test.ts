import { describe, it, expect, vi, afterEach } from "vitest";
import { extendGeometry, extendFilename, hasMargin, aiFillKey, renderExtended, buildFillRequest } from "@/lib/extend-utils";

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

import { extendSizeError, previewGeometry } from "@/lib/extend-utils";

describe("extendSizeError", () => {
  it("accepts normal outputs", () => {
    expect(extendSizeError(extendGeometry({ w: 4000, h: 3000 }, 1, 0.1))).toBeNull();
  });
  it("refuses outputs past the per-side cap", () => {
    const err = extendSizeError(extendGeometry({ w: 9000, h: 3000 }, null, 0.2));
    expect(err).toMatch(/per-side limit/);
  });
  it("refuses outputs past the megapixel cap", () => {
    const err = extendSizeError(extendGeometry({ w: 7000, h: 7000 }, null, 0.1));
    expect(err).toMatch(/MP limit/);
  });
});

describe("previewGeometry", () => {
  it("returns the same geometry when already within the preview cap", () => {
    const geo = extendGeometry({ w: 800, h: 600 }, 1, 0);
    expect(previewGeometry(geo)).toBe(geo);
  });
  it("scales every field uniformly so the longest side fits", () => {
    const geo = extendGeometry({ w: 4000, h: 2000 }, null, 0.25);
    const p = previewGeometry(geo, 1000);
    expect(Math.max(p.canvasW, p.canvasH)).toBe(1000);
    const s = p.canvasW / geo.canvasW;
    expect(p.imgW).toBe(Math.round(geo.imgW * s));
    expect(p.dx).toBe(Math.round(geo.dx * s));
    expect(p.canvasH).toBe(Math.round(geo.canvasH * s));
  });
});

describe("AI fill helpers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hasMargin is false only when the canvas equals the image", () => {
    expect(hasMargin(extendGeometry({ w: 200, h: 200 }, 1, 0))).toBe(false);
    expect(hasMargin(extendGeometry({ w: 200, h: 100 }, 1, 0))).toBe(true);
    expect(hasMargin(extendGeometry({ w: 200, h: 200 }, 1, 0.1))).toBe(true);
  });

  it("aiFillKey is stable for the same image and geometry, and changes with either", () => {
    const geo = extendGeometry({ w: 200, h: 100 }, 1, 0);
    expect(aiFillKey("blob:a", geo)).toBe(aiFillKey("blob:a", extendGeometry({ w: 200, h: 100 }, 1, 0)));
    expect(aiFillKey("blob:a", geo)).not.toBe(aiFillKey("blob:b", geo));
    expect(aiFillKey("blob:a", geo)).not.toBe(aiFillKey("blob:a", extendGeometry({ w: 200, h: 100 }, 54 / 17, 0)));
  });

  it("draws the generated fill over the whole canvas, then the sharp original on top", () => {
    const draw = vi.spyOn(CanvasRenderingContext2D.prototype, "drawImage");
    const img = new Image();
    const ai = document.createElement("canvas");
    const geo = extendGeometry({ w: 200, h: 100 }, 1, 0);
    renderExtended(img, geo, { style: "ai", color: "#ffffff", ai });
    expect(draw).toHaveBeenCalledTimes(2);
    expect(draw.mock.calls[0]).toEqual([ai, 0, 0, geo.canvasW, geo.canvasH]);
    expect(draw.mock.calls[1]).toEqual([img, geo.dx, geo.dy, geo.imgW, geo.imgH]);
  });

  it("falls back to the mirror fill while no AI fill exists", () => {
    const draw = vi.spyOn(CanvasRenderingContext2D.prototype, "drawImage");
    const geo = extendGeometry({ w: 200, h: 100 }, 1, 0);
    renderExtended(new Image(), geo, { style: "ai", color: "#ffffff", ai: null });
    // Mirror tiles (3 rows of the 200x100 image cover 200x200) plus the original on top
    expect(draw.mock.calls.length).toBeGreaterThan(2);
  });

  it("builds the fill mask WHITE where the model paints and BLACK over the original", async () => {
    // Flux Fill reads white = generate, black = keep; a flipped or transparent mask makes a
    // paid call return black margins without any error.
    const fills: { style: string; rect: number[] }[] = [];
    vi.spyOn(CanvasRenderingContext2D.prototype, "fillRect").mockImplementation(function (
      this: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
    ) {
      fills.push({ style: String(this.fillStyle).toLowerCase(), rect: [x, y, w, h] });
    });
    const geo = extendGeometry({ w: 200, h: 100 }, 54 / 17, 0); // wide: margins left and right
    await buildFillRequest(new Image(), geo, 1440);
    const s = 1440 / Math.max(geo.canvasW, geo.canvasH);
    const W = Math.round(geo.canvasW * s), H = Math.round(geo.canvasH * s);
    // image backdrop, then the mask: white everywhere, black over the original
    expect(fills.map((f) => f.style)).toEqual(["#808080", "#ffffff", "#000000"]);
    expect(fills[1].rect).toEqual([0, 0, W, H]);
    const [dx, dy, iw, ih] = fills[2].rect;
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBe(0);
    expect(dx + iw).toBeLessThan(W);
    expect(ih).toBe(H);
  });
});

