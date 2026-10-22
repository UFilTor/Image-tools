import { RATIOS, SECONDARY_RATIOS } from "./constants";
import type { CropRect } from "./types";

/**
 * Where Understory storefronts show images. Measured 2026-10-21 on
 * unless-library-neighborhood.understory.io (the Hands & Clay demo) at real phone, tablet and
 * desktop viewports, and checked against the `sizes` attribute each <img> declares. Every slot
 * uses `object-fit: cover` centered at 50% 50%, so each screen shows a different centered part
 * of the image, and only the middle is visible everywhere: the safe zone.
 *
 * "Common devices": phones 360-430px wide, plus tablets and desktops from 768px (with or without
 * a 15px classic scrollbar).
 * TODO(simplification): fixed slots from one storefront. Ceiling: phones under 360px and widths
 * 431-767px (narrow desktop windows, iPad mini portrait) crop tighter than the safe zone shows, and
 * a storefront layout change makes the numbers stale. Upgrade path: re-measure with
 * `scripts/measure-storefront.js` and update the slots below.
 */
export type StorefrontSlotKey = "cover" | "experience" | "secondary1" | "secondary2" | "secondary3";

export interface StorefrontSlot {
  /** Narrowest box the slot uses on a common device, as width / height */
  minBox: number;
  /** Widest box, as width / height */
  maxBox: number;
  /** Source width (px) that stays sharp at the slot's largest size on 2x and 3x screens */
  minWidth: number;
}

export const STOREFRONT_SLOTS: Record<StorefrontSlotKey, StorefrontSlot> = {
  // About section: a 300px-tall box (292px image). Width is 100vw - 96px on phones, 100vw - 120px
  // from 768px, and 1128px from 1248px. 360px phone: 264x292. Desktop: 1128x292, so 2256px at 2x.
  cover: { minBox: 264 / 292, maxBox: 1128 / 292, minWidth: 2256 },
  // The experience's main photo: storefront card (211px tall, 100vw - 72px on phones, 540x212 from
  // 1200px), experience page (phones: full width x 350px carousel; desktop: 797x450 main image),
  // and 113x113 thumbnails in the events list (the 1:1 minimum).
  // Sharpness: 797px main image at 2x, and a 430px phone at 3x shows the full 350px height.
  experience: { minBox: 1, maxBox: 540 / 212, minWidth: 1600 },
  // Secondary photos (photos 2-4 of an experience), one slot per how many the page shows. Phones:
  // every photo is a full-width 350px-tall carousel slide (360x350 to 430x350). From 768px they
  // share the right third of a 2fr/1fr grid, one row each with 4px gaps, gallery height
  // min(width / 1.6, 450px); photo 5 and later only show in "See all". Narrowest tile at 768px
  // (239 wide, 234 with a scrollbar), widest on desktop (399 wide). Measured 2026-10-21 on
  // nosworkshop.understory.io (1 photo) and the Hands & Clay demo (2 and 3 photos).
  // Sharpness: a 430px phone at 3x shows the full 350px height, so 1050px tall at the preset shape.
  secondary1: { minBox: 238.7 / 450, maxBox: 430 / 350, minWidth: 1300 }, // one 399x450 tile on desktop
  secondary2: { minBox: 360 / 350, maxBox: 398.7 / 223, minWidth: 1400 },
  secondary3: { minBox: 360 / 350, maxBox: 398.7 / 147.33, minWidth: 1750 },
};

/** Centered part of an image that every common device shows, as fractions of its width and height. */
export interface SafeZone {
  w: number;
  h: number;
}

/**
 * Safe zone for an image of `imageRatio` (w/h) in `slot`. A box wider than the image shows its
 * full width and crops the height to imageRatio / box; a narrower box shows the full height and
 * crops the width to box / imageRatio. The safe zone is the overlap of the narrowest and widest.
 */
export function safeZone(imageRatio: number, slot: StorefrontSlot): SafeZone {
  return { w: Math.min(1, slot.minBox / imageRatio), h: Math.min(1, imageRatio / slot.maxBox) };
}

/** The storefront slot a crop preset is for, or null for presets that aren't storefront sizes. */
export function slotForRatio(ratio: number | null): StorefrontSlot | null {
  const key = [...RATIOS, ...SECONDARY_RATIOS].find((r) => r.slot && r.value === ratio)?.slot;
  return key ? STOREFRONT_SLOTS[key] : null;
}

/** Safe zone for a crop preset, or null when the preset isn't a storefront size. */
export function safeZoneForRatio(ratio: number | null): SafeZone | null {
  const slot = slotForRatio(ratio);
  return slot && ratio ? safeZone(ratio, slot) : null;
}

/** The safe zone inside `crop`, in the same units as the crop. */
export function safeRect(crop: CropRect, zone: SafeZone): CropRect {
  const w = crop.w * zone.w;
  const h = crop.h * zone.h;
  return { x: crop.x + (crop.w - w) / 2, y: crop.y + (crop.h - h) / 2, w, h };
}

/** True for the Secondary photo preset at any count (1, 2 or 3 photos). */
export function isSecondaryRatio(ratio: number | null): boolean {
  return SECONDARY_RATIOS.some((r) => r.value === ratio);
}

/** Most photos the experience page's gallery shows: the main photo and 3 secondary ones. */
export const EXPERIENCE_SET_MAX = 4;

export interface SetPreset {
  role: "main" | "secondary";
  value: number;
  label: string;
}

/**
 * Shapes for an experience's photos in page order ("Full experience" in Crop): the first is the
 * main photo at the Experience preset, the rest are secondary photos at the shape for how many
 * there are (1, 2 or 3). Counts above EXPERIENCE_SET_MAX are cut to it.
 */
export function experienceSet(count: number): SetPreset[] {
  const n = Math.max(0, Math.min(EXPERIENCE_SET_MAX, Math.floor(count)));
  const exp = RATIOS.find((r) => r.slot === "experience")?.value;
  const main: SetPreset = { role: "main", value: typeof exp === "number" ? exp : 3 / 2, label: "Main photo" };
  const sec = SECONDARY_RATIOS.find((r) => r.count === n - 1);
  return Array.from({ length: n }, (_, i): SetPreset =>
    i === 0 || !sec ? main : { role: "secondary", value: sec.value, label: "Secondary photo" },
  );
}

/** Shown when more photos come in than the experience page's gallery shows. */
export const SET_OVERFLOW_NOTE = `The experience page shows ${EXPERIENCE_SET_MAX} photos, so the first ${EXPERIENCE_SET_MAX} are here. Use Secondary photo for the rest.`;

/** Give items in page order their Full experience roles (call with at most EXPERIENCE_SET_MAX). */
export function withSetPresets<T>(items: T[]): (T & { preset: SetPreset })[] {
  const presets = experienceSet(items.length);
  return items.map((it, i) => ({ ...it, preset: presets[i] }));
}

/**
 * Full experience after a reorder: roles follow position (the first is the main photo). Items
 * whose shape changed go through `reshape` (each tool re-crops its own way); the rest keep theirs.
 */
export function assignRoles<T extends { preset?: SetPreset }>(
  list: T[],
  reshape: (item: T & { preset: SetPreset }) => T & { preset: SetPreset } = (item) => item,
): (T & { preset: SetPreset })[] {
  return withSetPresets(list).map((it, i) => (list[i].preset?.value === it.preset.value ? it : reshape(it)));
}

/** The photos a Full experience keeps (the first EXPERIENCE_SET_MAX), the rest, and the note to show. */
export function splitSet<T>(list: T[]): { kept: T[]; dropped: T[]; note: string | null } {
  const dropped = list.slice(EXPERIENCE_SET_MAX);
  return { kept: list.slice(0, EXPERIENCE_SET_MAX), dropped, note: dropped.length ? SET_OVERFLOW_NOTE : null };
}
