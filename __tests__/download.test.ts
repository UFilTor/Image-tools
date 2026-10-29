import { describe, it, expect, vi } from "vitest";
import { cropFilename } from "@/lib/image-utils";
import { extendDownloadPlan, originalName, uniqueNames } from "@/lib/download";
import { safeZoneForRatio, withSetPresets } from "@/lib/storefront";

describe("download utils", () => {
  it("cropFilename generates correct batch filenames", () => {
    const names = ["photo1.jpg", "photo2.png", "landscape.webp"];
    const results = names.map(cropFilename);
    expect(results).toEqual(["photo1_crop.png", "photo2_crop.png", "landscape_crop.png"]);
  });
});

describe("extendDownloadPlan", () => {
  const photo = (name: string) => ({ src: `blob:${name}`, name, natural: { w: 1200, h: 900 }, adjusted: false });

  it("extends a Full experience photo by photo: own shape, own safe zone, names in page order", () => {
    const plan = extendDownloadPlan(withSetPresets([photo("studio.jpg"), photo("wheel.jpg")]), 1, true);
    expect(plan.map((p) => p.name)).toEqual(["1-main_studio_extended.png", "2-secondary_wheel_extended.png"]);
    expect(plan.map((p) => p.ratio)).toEqual([3 / 2, 4 / 5]);
    expect(plan[0].safe).toEqual(safeZoneForRatio(3 / 2));
    expect(plan[1].safe).toEqual(safeZoneForRatio(4 / 5));
  });

  it("uses the batch ratio and plain names outside a set, and no safe zone when the fit is off", () => {
    const plan = extendDownloadPlan([photo("a.jpg"), photo("b.jpg")], 16 / 10, false);
    expect(plan.map((p) => [p.name, p.ratio, p.safe])).toEqual([
      ["a_extended.png", 16 / 10, null],
      ["b_extended.png", 16 / 10, null],
    ]);
  });
});

describe("originalName", () => {
  it("keeps the name and extension the URL already has", () => {
    expect(originalName("https://brandstar.se/v2/assets/hero-2.jpg", "image/jpeg")).toBe("hero-2.jpg");
    expect(originalName("https://cdn.x/p/556913311_n.jpeg?stp=dst", "image/jpeg")).toBe("556913311_n.jpeg");
  });

  it("names the file after what the server sent when that differs from the URL", () => {
    expect(originalName("https://cdn.x/p/photo.jpg", "image/webp")).toBe("photo.webp");
    expect(originalName("https://cdn.x/p/photo.tiff", "application/octet-stream")).toBe("photo.tiff");
  });

  it("adds an extension from the type when the URL has none, and a name when the path is empty", () => {
    expect(originalName("https://cdn.x/media/abc123", "image/png")).toBe("abc123.png");
    expect(originalName("https://cdn.x/", "image/webp", 2)).toBe("image-3.webp");
  });
});

describe("uniqueNames", () => {
  it("numbers repeats before the extension, ignoring case", () => {
    expect(uniqueNames(["a.jpg", "b.jpg", "A.jpg", "a.jpg", "c"])).toEqual(["a.jpg", "b.jpg", "A-2.jpg", "a-3.jpg", "c"]);
    // A name that already looks numbered is not handed out twice.
    expect(uniqueNames(["a.jpg", "a.jpg", "a-2.jpg"])).toEqual(["a.jpg", "a-2.jpg", "a-2-2.jpg"]);
  });
});
