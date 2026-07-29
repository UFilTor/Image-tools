import { describe, it, expect } from "vitest";
import {
  upscaleFilename,
  predictUpscaleSize,
  upscaleSizeError,
  MAX_OUTPUT_PIXELS,
  MAX_OUTPUT_SIDE,
} from "@/lib/upscale";

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
});
