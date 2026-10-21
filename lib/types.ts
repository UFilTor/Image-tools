import type { SetPreset, StorefrontSlotKey } from "./storefront";

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NaturalSize {
  w: number;
  h: number;
}

export interface DisplaySize {
  dw: number;
  dh: number;
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FocalPoint {
  x: number;
  y: number;
}

export interface FocalResult {
  bbox: BoundingBox | null;
  focalPoint?: FocalPoint;
  label: string;
  error?: string;
}

export interface Ratio {
  label: string;
  sub: string;
  value: number | null;
  /** Storefront slot this preset is for; the editor then draws its safe zone (lib/storefront.ts) */
  slot?: StorefrontSlotKey;
}

export interface CropQueueItem {
  src: string;
  name: string;
  natural: NaturalSize;
  disp: DisplaySize;
  crop: CropRect;
  adjusted: boolean;
  /** Full experience: this photo's own shape and role; without it the batch shares one ratio */
  preset?: SetPreset;
}

export interface ExtendQueueItem {
  src: string;
  name: string;
  natural: NaturalSize;
  adjusted: boolean;
  /** Full experience: this photo's own shape and role; without it the queue shares one ratio */
  preset?: SetPreset;
}

export type CropDragType = "move" | "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r";

export interface MultiCropItem {
  /** Stable id so async analysis results land on the right item even after reordering. */
  id: string;
  src: string;
  name: string;
  natural: NaturalSize;
  disp: DisplaySize;
  status: "pending" | "analyzing" | "recalculating" | "done" | "error";
  focal: FocalResult | null;
  crop: CropRect | null;
  ratio: number;
  /** Full experience: this photo's own shape and role; without it the batch shares one ratio */
  preset?: SetPreset;
}

export type UpscaleFactor = 2 | 4;

export interface UpscaleItem {
  src: string;
  name: string;
  natural: NaturalSize;
  /** Auto-picked per image: small sources get upscaled, large ones get enhanced (1x). */
  mode: "upscale" | "enhance";
  status: "queued" | "processing" | "done" | "error";
  /** 0-100, set during processing */
  progress: number;
  /** object URL of the upscaled image, set when done */
  result: string | null;
  /** dimensions of the upscaled result, set when done */
  resultNatural: NaturalSize | null;
  error?: string;
}
