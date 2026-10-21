import { describe, it, expect } from "vitest";
import { cropFilename, dispSize, orderedName, queueCropFilename } from "@/lib/image-utils";

describe("cropFilename", () => {
  it("appends _crop.png to filename", () => {
    expect(cropFilename("photo.jpg")).toBe("photo_crop.png");
  });

  it("handles files without extension", () => {
    expect(cropFilename("photo")).toBe("photo_crop.png");
  });

  it("returns default for empty input", () => {
    expect(cropFilename("")).toBe("crop.png");
  });

  it("returns default for undefined input", () => {
    expect(cropFilename(undefined as unknown as string)).toBe("crop.png");
  });

  it("handles multiple dots in filename", () => {
    expect(cropFilename("my.photo.jpg")).toBe("my.photo_crop.png");
  });
});

describe("dispSize", () => {
  it("scales down large images to fit viewport", () => {
    const result = dispSize(4000, 3000, 1000, 800);
    expect(result.dw).toBeLessThanOrEqual(1000);
    expect(result.dh).toBeLessThanOrEqual(800);
  });

  it("does not scale up small images", () => {
    const result = dispSize(200, 150, 1000, 800);
    expect(result.dw).toBe(200);
    expect(result.dh).toBe(150);
  });

  it("maintains aspect ratio", () => {
    const nw = 1600, nh = 900;
    const result = dispSize(nw, nh, 800, 600);
    const originalRatio = nw / nh;
    const resultRatio = result.dw / result.dh;
    expect(resultRatio).toBeCloseTo(originalRatio, 1);
  });
});

describe("queueCropFilename", () => {
  it("leads Full experience files with page position and role, so files sort in page order", () => {
    expect(queueCropFilename("studio.jpg", 0, "main")).toBe("1-main_studio_crop.png");
    expect(queueCropFilename("wheel.jpg", 2, "secondary")).toBe("3-secondary_wheel_crop.png");
  });

  it("keeps the plain name outside a set", () => {
    expect(queueCropFilename("studio.jpg", 3)).toBe(cropFilename("studio.jpg"));
  });
});

describe("orderedName", () => {
  it("prefixes any tool's file name with page position and role, and leaves others alone", () => {
    expect(orderedName("wheel_extended.png", 1, "secondary")).toBe("2-secondary_wheel_extended.png");
    expect(orderedName("wheel_extended.png", 1)).toBe("wheel_extended.png");
  });
});
