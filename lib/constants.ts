import { Ratio } from "./types";

export const RATIOS: Ratio[] = [
  { label: "Square", sub: "1:1", value: 1 },
  { label: "Experience", sub: "1.4:1", value: 1.4 },
  { label: "Cover image", sub: "54:17", value: 54 / 17 },
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
export const EDITOR_INSETS = { x: 96, y: 230 } as const;

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

export const STORAGE_KEYS = {
  lastRatio: "image-tools:last-ratio",
} as const;

export const LOGO_RECOLOR_PRESETS = [
  { key: "none", label: "Original colors", swatch: null },
  { key: "#ffffff", label: "White", swatch: "#ffffff" },
  { key: "#000000", label: "Black", swatch: "#000000" },
  { key: "custom", label: "Custom", swatch: null },
] as const;
