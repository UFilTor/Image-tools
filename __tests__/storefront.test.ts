import { describe, it, expect } from "vitest";
import { STOREFRONT_SLOTS, safeZone, safeZoneForRatio, slotForRatio, safeRect, isSecondaryRatio, experienceSet, withSetPresets } from "@/lib/storefront";
import { FETCH_KEY, RATIOS, SECONDARY_RATIOS, uploadCards } from "@/lib/constants";
import { centeredOnBbox } from "@/lib/crop-math";
import { extendGeometry } from "@/lib/extend-utils";

const preset = (label: string) => RATIOS.find((r) => r.label === label)!.value;

describe("storefront slots", () => {
  it("match the boxes measured on 2026-10-21 (360px phone to desktop)", () => {
    // Cover: 264x292 on a 360px phone, 1128x292 on desktop
    expect(STOREFRONT_SLOTS.cover.minBox).toBeCloseTo(0.904, 3);
    expect(STOREFRONT_SLOTS.cover.maxBox).toBeCloseTo(3.863, 3);
    // Experience photos: 113x113 events thumbnail, 540x212 storefront card on desktop
    expect(STOREFRONT_SLOTS.experience.minBox).toBe(1);
    expect(STOREFRONT_SLOTS.experience.maxBox).toBeCloseTo(2.547, 3);
  });

  it("asks for enough source width to stay sharp at each slot's largest size", () => {
    // SizeWarning shows under these widths
    expect(STOREFRONT_SLOTS.cover.minWidth).toBe(1128 * 2); // 1128px desktop cover box at 2x
    expect(STOREFRONT_SLOTS.experience.minWidth).toBeGreaterThanOrEqual(797 * 2); // desktop main image at 2x
    expect(STOREFRONT_SLOTS.experience.minWidth).toBeGreaterThanOrEqual(350 * 3 * (3 / 2)); // 350px phone carousel at 3x, 3:2 photo
  });

  it("links the Experience and Cover presets to their slots, and nothing else", () => {
    expect(slotForRatio(preset("Experience"))).toBe(STOREFRONT_SLOTS.experience);
    expect(slotForRatio(preset("Cover image"))).toBe(STOREFRONT_SLOTS.cover);
    expect(slotForRatio(preset("Square"))).toBeNull();
    expect(slotForRatio(null)).toBeNull();
    expect(safeZoneForRatio(null)).toBeNull();
  });

  it("gives the safe zones the presets were chosen for", () => {
    const exp = safeZoneForRatio(3 / 2)!;
    expect(exp.w).toBeCloseTo(0.667, 3); // a 1:1 box shows 2/3 of a 3:2 image's width
    expect(exp.h).toBeCloseTo(0.589, 3); // a 2.547:1 box shows 59% of its height
    const cover = safeZoneForRatio(16 / 10)!;
    expect(cover.w).toBeCloseTo(0.565, 3);
    expect(cover.h).toBeCloseTo(0.414, 3);
  });

  it("keeps the same safe area for any ratio inside the slot's range: only the shape changes", () => {
    const { cover } = STOREFRONT_SLOTS;
    const area = (r: number) => safeZone(r, cover).w * safeZone(r, cover).h;
    expect(area(1.5)).toBeCloseTo(cover.minBox / cover.maxBox, 6);
    expect(area(16 / 9)).toBeCloseTo(cover.minBox / cover.maxBox, 6);
  });

  it("caps at the whole image: an image narrower than every box keeps its width, a wider one its height", () => {
    expect(safeZone(0.5, STOREFRONT_SLOTS.experience).w).toBe(1);
    expect(safeZone(4, STOREFRONT_SLOTS.experience).h).toBe(1);
  });

  it("centers the safe rect in the crop", () => {
    expect(safeRect({ x: 10, y: 20, w: 300, h: 200 }, { w: 0.5, h: 0.25 })).toEqual({ x: 85, y: 95, w: 150, h: 50 });
  });
});

describe("Smart Crop with a safe zone", () => {
  // A wide subject (a group) with the focal point at its left end: centering on the focal point
  // and then only keeping the subject inside the crop leaves its right side outside the safe zone.
  const W = 1500, H = 500;
  const bbox = { x1: 0.3, y1: 0.3, x2: 0.62, y2: 0.7 };
  const focal = { x: 0.32, y: 0.5 };
  const zone = safeZoneForRatio(3 / 2)!;
  const inside = (crop: { x: number; y: number; w: number; h: number }) => {
    const s = safeRect(crop, zone);
    return bbox.x1 * W >= s.x - 1 && bbox.x2 * W <= s.x + s.w + 1 && bbox.y1 * H >= s.y - 1 && bbox.y2 * H <= s.y + s.h + 1;
  };

  it("keeps the subject inside the safe zone, not just inside the crop", () => {
    expect(inside(centeredOnBbox(W, H, 3 / 2, bbox, focal, null))).toBe(false); // the old placement
    expect(inside(centeredOnBbox(W, H, 3 / 2, bbox, focal, zone))).toBe(true);
  });

  it("changes nothing without a safe zone", () => {
    expect(centeredOnBbox(W, H, 3 / 2, bbox, focal, null)).toEqual(centeredOnBbox(W, H, 3 / 2, bbox, focal));
  });
});

describe("Extend: fit inside safe zone", () => {
  it("grows the canvas until the whole image sits inside the safe zone", () => {
    const ratio = 16 / 10;
    const zone = safeZoneForRatio(ratio)!;
    const geo = extendGeometry({ w: 800, h: 300 }, ratio, 0, zone);
    expect(geo.canvasW / geo.canvasH).toBeCloseTo(ratio, 2);
    const s = safeRect({ x: 0, y: 0, w: geo.canvasW, h: geo.canvasH }, zone);
    expect(geo.dx).toBeGreaterThanOrEqual(Math.floor(s.x));
    expect(geo.dx + geo.imgW).toBeLessThanOrEqual(Math.ceil(s.x + s.w));
    expect(geo.dy).toBeGreaterThanOrEqual(Math.floor(s.y));
    expect(geo.dy + geo.imgH).toBeLessThanOrEqual(Math.ceil(s.y + s.h));
  });
});

describe("secondary photos", () => {
  it("match the tiles measured on 2026-10-21 (360px phone to desktop, 1 to 3 photos)", () => {
    // 1 photo: one 239x450 tile at 768px, 430x350 phone slide
    expect(STOREFRONT_SLOTS.secondary1.minBox).toBeCloseTo(0.530, 3);
    expect(STOREFRONT_SLOTS.secondary1.maxBox).toBeCloseTo(1.229, 3);
    // 2 and 3 photos: 360x350 phone slide to 399x223 / 399x147 desktop tiles
    expect(STOREFRONT_SLOTS.secondary2.minBox).toBeCloseTo(1.029, 3);
    expect(STOREFRONT_SLOTS.secondary2.maxBox).toBeCloseTo(1.788, 3);
    expect(STOREFRONT_SLOTS.secondary3.maxBox).toBeCloseTo(2.706, 3);
  });

  it("uses 4:5, 4:3 and 5:3, and each count gets its own safe zone", () => {
    expect(SECONDARY_RATIOS.map((r) => [r.count, r.value])).toEqual([[1, 4 / 5], [2, 4 / 3], [3, 5 / 3]]);
    const area = (r: number) => { const z = safeZoneForRatio(r)!; return z.w * z.h; };
    expect(area(4 / 5)).toBeCloseTo(0.432, 3);
    expect(area(4 / 3)).toBeCloseTo(0.575, 3);
    expect(area(5 / 3)).toBeCloseTo(0.380, 3);
  });

  it("starts the Secondary photo card at 3 photos and recognises every count", () => {
    expect(slotForRatio(RATIOS.find((r) => r.label === "Secondary photo")!.value)).toBe(STOREFRONT_SLOTS.secondary3);
    for (const r of SECONDARY_RATIOS) expect(isSecondaryRatio(r.value)).toBe(true);
    expect(isSecondaryRatio(3 / 2)).toBe(false);
    expect(isSecondaryRatio(null)).toBe(false);
  });

  it("asks for enough width that a 430px phone at 3x stays sharp", () => {
    for (const r of SECONDARY_RATIOS) {
      // The 350px-tall slide at 3x needs 1050px of height, so width 1050 x shape (and 1290 for the 430px width)
      expect(slotForRatio(r.value)!.minWidth).toBeGreaterThanOrEqual(Math.max(430 * 3, 1050 * r.value) - 1);
    }
  });
});

describe("experienceSet (Crop's Full experience)", () => {
  const shapes = (n: number) => experienceSet(n).map((p) => `${p.role} ${p.value.toFixed(3)}`);

  it("makes the first photo the main one at 3:2 and gives the rest the shape for their count", () => {
    expect(shapes(1)).toEqual(["main 1.500"]);
    expect(shapes(2)).toEqual(["main 1.500", "secondary 0.800"]);
    expect(shapes(3)).toEqual(["main 1.500", "secondary 1.333", "secondary 1.333"]);
    expect(shapes(4)).toEqual(["main 1.500", "secondary 1.667", "secondary 1.667", "secondary 1.667"]);
  });

  it("stops at the 4 photos the page's gallery shows, and handles nothing", () => {
    expect(experienceSet(7)).toHaveLength(4);
    expect(experienceSet(0)).toEqual([]);
  });

  it("uses the Experience preset for the main photo, so both stay in step", () => {
    expect(experienceSet(1)[0].value).toBe(RATIOS.find((r) => r.slot === "experience")!.value);
  });
});

describe("uploadCards", () => {
  const names = (withSet: boolean) => uploadCards(withSet).map((c) => (c.kind === "set" ? "Full experience" : c.ratio.label));

  it("puts Full experience at 4, right after Secondary photo, and keeps Free last (Crop)", () => {
    expect(names(true)).toEqual(["Square", "Experience", "Secondary photo", "Full experience", "Cover image", "Free"]);
  });

  it("puts Fetch from a website on the key after the cards", () => {
    expect(FETCH_KEY).toBe("7");
  });

  it("is just the ratios where Full experience isn't offered", () => {
    expect(names(false)).toEqual(RATIOS.map((r) => r.label));
  });
});

describe("withSetPresets", () => {
  it("gives items their roles by position, so a reorder moves the main photo", () => {
    const roles = (names: string[]) => withSetPresets(names.map((name) => ({ name }))).map((it) => `${it.name}:${it.preset.role}`);
    expect(roles(["a", "b", "c"])).toEqual(["a:main", "b:secondary", "c:secondary"]);
    expect(roles(["c", "a", "b"])).toEqual(["c:main", "a:secondary", "b:secondary"]);
  });
});
