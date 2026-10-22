import { describe, it, expect, vi } from "vitest";
import { cropFilename } from "@/lib/image-utils";
import { extendDownloadPlan } from "@/lib/download";
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
