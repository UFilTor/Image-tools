import { Ratio } from "./types";

/** Crop presets in display order; number keys 1-5 pick them in this order everywhere. */
export const RATIOS: Ratio[] = [
  { label: "Square", sub: "1:1", value: 1 },
  // Storefront presets, chosen 2026-10-21 from measured storefront slots (lib/storefront.ts).
  { label: "Experience", sub: "3:2", value: 3 / 2, slot: "experience" },
  // One card for the experience page's secondary photos; it starts at 3 photos (the most a page
  // shows) and the editor's 1 / 2 / 3 switch picks the shape for the count (SECONDARY_RATIOS).
  { label: "Secondary photo", sub: "1, 2 or 3 photos", value: 5 / 3, slot: "secondary3" },
  { label: "Cover image", sub: "16:10", value: 16 / 10, slot: "cover" },
  { label: "Free", sub: "Original", value: null },
];

/** The card for a whole experience (Crop, Smart Crop, Extend): main photo plus secondary photos. */
export const FULL_EXPERIENCE = { label: "Full experience", sub: "Main + secondary photos" } as const;

export type UploadCard = { kind: "ratio"; ratio: Ratio } | { kind: "set" };

/** A card's title and the line under it. */
export function cardText(card: UploadCard): { label: string; sub: string } {
  return card.kind === "set" ? FULL_EXPERIENCE : { label: card.ratio.label, sub: card.ratio.sub };
}

/**
 * Upload and ratio-picker cards in key order (1, 2, …): the ratios, with Full experience right
 * after Secondary photo where it's offered, so the experience page's cards sit together and Free
 * stays last. Shared by the cards, Extend's Target ratio and the help panel.
 */
export function uploadCards(withFullExperience: boolean): UploadCard[] {
  const cards: UploadCard[] = RATIOS.map((ratio) => ({ kind: "ratio", ratio }));
  if (withFullExperience) {
    const secondary = cards.findIndex((c) => c.kind === "ratio" && c.ratio.slot?.startsWith("secondary"));
    cards.splice(secondary < 0 ? cards.length : secondary + 1, 0, { kind: "set" });
  }
  return cards;
}

/** Opens "Fetch from a website" on every upload screen: the number after the cards. */
export const FETCH_KEY = String(uploadCards(true).length + 1);

/** Secondary photo shapes per count, balanced over phone, tablet and desktop (chosen 2026-10-21). */
export const SECONDARY_RATIOS: (Ratio & { value: number; count: 1 | 2 | 3 })[] = [
  { count: 1, label: "Secondary photo", sub: "4:5", value: 4 / 5, slot: "secondary1" },
  { count: 2, label: "Secondary photo", sub: "4:3", value: 4 / 3, slot: "secondary2" },
  { count: 3, label: "Secondary photo", sub: "5:3", value: 5 / 3, slot: "secondary3" },
];

export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/heic", "image/heif", "image/svg+xml"];

const EXTRA_EXTENSIONS = [".heic", ".heif", ".svg", ".avif"];

/** Human-readable list of accepted formats. Keep in step with ACCEPTED_TYPES; every UI mention reads this. */
export const ACCEPTED_FORMATS_LABEL = "PNG, JPG, WebP, AVIF, HEIC, or SVG";

/** Smallest crop box, in display pixels. Shared by crop math, drag handles and the size input. */
export const MIN_CROP_SIZE = 60;

/** Space reserved around the crop editor (nav, header row, action buttons), in px. */
export const EDITOR_INSETS = { x: 96, y: 266 } as const;

/** Color distance tolerance for logo background detection/removal. */
export const BG_TOLERANCE = 40;

/** Longest side of the Extend preview canvas; full resolution is only rendered on download. */
export const EXTEND_PREVIEW_MAX_SIDE = 1400;

/** Check if a file is an accepted type (by MIME or extension for types with unreliable MIME) */
export function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return EXTRA_EXTENSIONS.includes(ext);
}

export const SHORTCUT_MAP = {
  modes: ["crop", "smart-crop", "extend", "upscale", "logo"] as const,
  ratios: [0, 1, 2, 3, 4] as const, // indices into RATIOS
};

/** A tool's route segment ("/upscale" → "upscale"). */
export type ToolKey = (typeof SHORTCUT_MAP.modes)[number];

/**
 * "Send to" targets: where a finished image can go next without a download and re-upload.
 * Only chains that make sense (no Crop → Smart Crop); the order is the button order.
 */
export const SEND_TARGETS: Record<ToolKey, readonly ToolKey[]> = {
  crop: ["upscale", "extend", "logo"],
  "smart-crop": ["upscale", "extend"],
  extend: ["upscale", "crop"],
  upscale: ["crop", "extend", "logo"],
  logo: ["upscale"],
};

export const STORAGE_KEYS = {
  lastRatio: "image-tools:last-ratio",
  safeZoneHidden: "image-tools:safe-zone-hidden",
} as const;

export const LOGO_RECOLOR_PRESETS = [
  { key: "none", label: "Original colors", swatch: null },
  { key: "#ffffff", label: "White", swatch: "#ffffff" },
  { key: "#000000", label: "Black", swatch: "#000000" },
  { key: "custom", label: "Custom", swatch: null },
] as const;

/** Checkerboard behind transparent previews; `size` is one square in px. */
export function checkerBg(size = 16): string {
  return `repeating-conic-gradient(var(--checker-tint) 0% 25%, var(--surface) 0% 50%) 50% / ${size}px ${size}px`;
}

/**
 * The tools, in tab order (matches SHORTCUT_MAP.modes). `hint` is the short line under the tab
 * name; `about` is the tab tooltip and the start page description. A first-time user test showed
 * "Smart Crop", "Extend" and "Upscale" don't explain themselves.
 */
export const TOOLS = [
  { href: "/crop", label: "Crop", num: "1", hint: "Fixed sizes", about: "Crop photos to booking page sizes" },
  { href: "/smart-crop", label: "Smart Crop", num: "2", hint: "AI finds the subject", about: "Crop a batch of photos; AI keeps people in frame" },
  { href: "/extend", label: "Extend", num: "3", hint: "Add space around", about: "Add space around a photo to fit a size" },
  { href: "/upscale", label: "Upscale", num: "4", hint: "Sharper or bigger", about: "Make photos sharper, and small ones bigger" },
  { href: "/logo", label: "Logo", num: "5", hint: "Background, colors", about: "Remove a logo's background, change colors or erase parts" },
] as const;
