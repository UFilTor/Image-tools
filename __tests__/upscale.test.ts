import { describe, it, expect } from "vitest";
import {
  upscaleFilename,
  predictUpscaleSize,
  upscaleSizeError,
  pickMode,
  enhanceSizeError,
  modeSizeError,
  ENHANCE_THRESHOLD,
  MAX_OUTPUT_PIXELS,
  MAX_OUTPUT_SIDE,
} from "@/lib/upscale";

describe("pickMode", () => {
  it("upscales small images", () => {
    expect(pickMode({ w: 400, h: 300 })).toBe("upscale");
    expect(pickMode({ w: 999, h: 400 })).toBe("upscale");
  });

  it("enhances images at or above the threshold on the longest side", () => {
    expect(ENHANCE_THRESHOLD).toBe(1000);
    expect(pickMode({ w: 1000, h: 400 })).toBe("enhance");
    expect(pickMode({ w: 400, h: 2400 })).toBe("enhance");
  });
});

describe("enhanceSizeError", () => {
  it("allows a typical large photo", () => {
    expect(enhanceSizeError({ w: 3000, h: 2000 })).toBeNull();
  });
  it("blocks sources whose 2x intermediate exceeds the caps", () => {
    // 4000x4000 -> 8000x8000 intermediate = 64MP > 40MP cap
    const msg = enhanceSizeError({ w: 4000, h: 4000 });
    expect(msg).toContain("Too large to enhance");
  });
});

describe("modeSizeError", () => {
  it("allows upscaling a medium image that auto-defaults to enhance", () => {
    // 1600px source: pickMode says enhance, but 2x output (3200px) fits the caps,
    // so the mode toggle must offer Upscale.
    expect(pickMode({ w: 1600, h: 1200 })).toBe("enhance");
    expect(modeSizeError({ w: 1600, h: 1200 }, "upscale", 2)).toBeNull();
  });
  it("routes to the right guard per mode", () => {
    expect(modeSizeError({ w: 4000, h: 4000 }, "upscale", 4)).toContain("Too large for 4×");
    expect(modeSizeError({ w: 4000, h: 4000 }, "enhance", 2)).toContain("Too large to enhance");
  });
});

describe("predictUpscaleSize", () => {
  it("multiplies both dimensions by the scale", () => {
    expect(predictUpscaleSize({ w: 100, h: 50 }, 4)).toEqual({ w: 400, h: 200 });
  });
});

describe("upscaleSizeError", () => {
  it("allows a normal image at 2x", () => {
    expect(upscaleSizeError({ w: 1000, h: 800 }, 2)).toBeNull();
  });

  it("allows a normal image at 4x", () => {
    expect(upscaleSizeError({ w: 800, h: 600 }, 4)).toBeNull();
  });

  it("blocks when total output pixels exceed the cap", () => {
    // 4000x4000 source at 4x -> 16000x16000 = 256MP, over both caps
    const msg = upscaleSizeError({ w: 4000, h: 4000 }, 4);
    expect(msg).toContain("Too large for 4×");
    expect(msg).toContain("16000×16000");
  });

  it("blocks when a single side exceeds the side cap even if area is under", () => {
    // 6000x100 at 2x -> 12000x200: only 2.4MP but 12000 > MAX_OUTPUT_SIDE
    expect(MAX_OUTPUT_SIDE).toBe(10_000);
    const msg = upscaleSizeError({ w: 6000, h: 100 }, 2);
    expect(msg).not.toBeNull();
    expect(msg).toContain("Too large for 2×");
  });

  it("suggests 2x specifically when 4x is too large", () => {
    const msg = upscaleSizeError({ w: 3000, h: 3000 }, 4);
    expect(msg).toContain("Try 2×");
  });

  it("passes an image right at the pixel cap boundary", () => {
    // choose a source whose 2x output is just under MAX_OUTPUT_PIXELS
    const side = Math.floor(Math.sqrt(MAX_OUTPUT_PIXELS) / 2) - 1;
    expect(upscaleSizeError({ w: side, h: side }, 2)).toBeNull();
  });
});

describe("upscaleFilename", () => {
  it("appends the scale and forces png", () => {
    expect(upscaleFilename("photo.jpg", 4)).toBe("photo_4x.png");
  });
  it("falls back for empty names", () => {
    expect(upscaleFilename("", 2)).toBe("upscaled_2x.png");
  });
  it("names enhanced results without a scale suffix", () => {
    expect(upscaleFilename("photo.jpg", 2, "enhance")).toBe("photo_enhanced.png");
    expect(upscaleFilename("", 2, "enhance")).toBe("enhanced.png");
  });
});
