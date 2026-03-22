import { Ratio } from "./types";

export const RATIOS: Ratio[] = [
  { label: "Square", sub: "1:1", value: 1 },
  { label: "Experience", sub: "1.4:1", value: 1.4 },
  { label: "Cover image", sub: "54:17", value: 54 / 17 },
  { label: "Free", sub: "Original", value: null },
];

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export const SHORTCUT_MAP = {
  modes: ["crop", "smart-crop", "logo"] as const,
  ratios: [0, 1, 2, 3] as const, // indices into RATIOS
};

export const LOGO_RECOLOR_PRESETS = [
  { key: "none", label: "Original colors", swatch: null },
  { key: "#ffffff", label: "White", swatch: "#ffffff" },
  { key: "#000000", label: "Black", swatch: "#000000" },
  { key: "custom", label: "Custom", swatch: null },
] as const;
