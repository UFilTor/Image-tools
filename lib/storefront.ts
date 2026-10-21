import { RATIOS } from "./constants";
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
export type StorefrontSlotKey = "cover" | "experience";

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
  // The experience's photos: storefront card (211px tall, 100vw - 72px on phones, 540x212 from
  // 1200px), experience page (phones: full width x 350px carousel; desktop: 797x450 main image
  // and 399x223 side tiles), and 113x113 thumbnails in the events list (the 1:1 minimum).
  // Sharpness: 797px main image at 2x, and a 430px phone at 3x shows the full 350px height.
  experience: { minBox: 1, maxBox: 540 / 212, minWidth: 1600 },
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
  const key = RATIOS.find((r) => r.slot && r.value === ratio)?.slot;
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
