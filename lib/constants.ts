import { Ratio } from "./types";

export const RATIOS: Ratio[] = [
  { label: "Square", sub: "1:1", value: 1 },
  // Storefront presets, chosen 2026-10-21 from measured storefront slots (lib/storefront.ts).
  { label: "Experience", sub: "3:2", value: 3 / 2, slot: "experience" },
  { label: "Cover image", sub: "16:10", value: 16 / 10, slot: "cover" },
  { label: "Free", sub: "Original", value: null },
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
  ratios: [0, 1, 2, 3] as const, // indices into RATIOS
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
