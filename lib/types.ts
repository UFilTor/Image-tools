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

export interface FocalResult {
  bbox: BoundingBox | null;
  label: string;
  error?: string;
}

export interface Ratio {
  label: string;
  sub: string;
  value: number | null;
}

export interface CropQueueItem {
  src: string;
  name: string;
  natural: NaturalSize;
  disp: DisplaySize;
  crop: CropRect;
  adjusted: boolean;
}

export type CropDragType = "move" | "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r";

export interface MultiCropItem {
  src: string;
  name: string;
  mime: string;
  natural: NaturalSize;
  disp: DisplaySize;
  status: "pending" | "analyzing" | "recalculating" | "done" | "error";
  focal: FocalResult | null;
  crop: CropRect | null;
  ratio: number;
}
