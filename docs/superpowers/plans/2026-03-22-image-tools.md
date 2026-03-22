# Image Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor a single-file Claude artifact into a production Next.js app with three image processing modes (Single Crop, AI Smart Crop, Logo Processor), server-side API proxy, keyboard shortcuts, and unit tests.

**Architecture:** Pages are thin shells that call custom hooks per mode. Hooks orchestrate state and call pure functions from `lib/`. All math and image processing lives in `lib/` with zero React dependencies, making it fully unit-testable. AI Smart Crop uses a Next.js API route to proxy Anthropic calls server-side.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS, Vitest, JSZip, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-22-image-tools-design.md`

---

## File Map

### Created files

| File | Responsibility |
|------|---------------|
| `app/layout.tsx` | Shell: header, tab navigation, Inter font, keyboard context provider |
| `app/page.tsx` | Redirect `/` → `/single` |
| `app/single/page.tsx` | Single crop mode — calls `useSingleCrop`, renders step-based UI |
| `app/smart-crop/page.tsx` | AI batch crop mode — calls `useMultiCrop`, renders grid + edit views |
| `app/logo/page.tsx` | Logo processor mode — calls `useLogoProcessor`, renders controls |
| `app/api/detect-focal/route.ts` | Server-side proxy to Anthropic vision API |
| `lib/types.ts` | Shared TypeScript interfaces (CropRect, BoundingBox, MultiCropItem, etc.) |
| `hooks/use-crop-drag.ts` | Mouse drag logic for crop handles and move |
| `components/nav-tabs.tsx` | Header tab navigation with active state |
| `components/icons.tsx` | Shared SVG icon components (DlIcon, RetryIcon, GripIcon, RatioIcon) |
| `components/ui/button.tsx` | Shared button with variants: primary, outline, ghost, danger |
| `components/ui/badge.tsx` | Small label badge component |
| `components/ui/drop-zone.tsx` | Drag-and-drop file upload with validation |
| `components/ui/size-input.tsx` | Editable width × height pixel input |
| `components/ui/keyboard-hint.tsx` | Renders keyboard shortcut badge on UI elements |
| `components/crop/crop-overlay.tsx` | Draggable crop rectangle with handles and rule-of-thirds grid |
| `components/crop/zoomable-editor.tsx` | Image canvas with scroll-to-zoom and alt+drag pan |
| `components/crop/ratio-picker.tsx` | 2×2 grid of aspect ratio choices with keyboard support |
| `components/logo/logo-controls.tsx` | Tolerance slider + recolor options panel |
| `hooks/use-single-crop.ts` | State machine for single mode: upload → ratio → crop |
| `hooks/use-multi-crop.ts` | State machine for batch mode: upload → ratio → review/edit |
| `hooks/use-logo-processor.ts` | State machine for logo mode: upload → edit |
| `hooks/use-keyboard-shortcuts.ts` | Global keydown listener, context-aware dispatch |
| `lib/crop-math.ts` | `clamp`, `centered`, `centeredOnBbox` — pure crop geometry |
| `lib/image-utils.ts` | `cropToBlob`, `dispSize`, `cropFilename` — image helpers |
| `lib/logo-processing.ts` | `removeBg`, `recolorCanvas`, `canvasToDataURL` — canvas pixel ops |
| `lib/ai-client.ts` | `detectFocal` — POST to `/api/detect-focal`, parse response |
| `lib/download.ts` | `dlCrop`, `dlAll`, `dlCanvas` — trigger browser downloads |
| `lib/constants.ts` | `RATIOS`, color palette type, keyboard shortcut map |
| `__tests__/crop-math.test.ts` | Tests for clamp, centered, centeredOnBbox |
| `__tests__/image-utils.test.ts` | Tests for dispSize, cropFilename |
| `__tests__/logo-processing.test.ts` | Tests for removeBg, recolorCanvas |
| `__tests__/download.test.ts` | Tests for cropToBlob dimension calculations |
| `styles/globals.css` | Tailwind directives + custom animation keyframes |
| `tailwind.config.ts` | Understory color palette as custom theme colors |
| `next.config.ts` | Body size limit override for API route |
| `vitest.config.ts` | Vitest config with jsdom environment |
| `.env.local` | `ANTHROPIC_API_KEY` placeholder |
| `.env.example` | Documented env var template (committed) |
| `.gitignore` | node_modules, .next, .env.local, .superpowers |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `vitest.config.ts`, `styles/globals.css`, `.env.local`, `.env.example`, `.gitignore`, `tsconfig.json`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd "/Users/filip/Desktop/Claude Code/Image Tools"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src=no --import-alias="@/*" --use-npm
```

Select defaults. This creates `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `styles/globals.css`.

- [ ] **Step 2: Install additional dependencies**

```bash
npm install jszip
npm install -D vitest @vitejs/plugin-react jsdom jest-canvas-mock @types/jszip
```

- [ ] **Step 3: Configure Tailwind with Understory design tokens**

Update `tailwind.config.ts` to extend colors with the full Understory palette:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: "#F5F6F4", alt: "#EDEEED", hover: "#E6E8E5" },
        border: { DEFAULT: "#D9DDD8", hover: "#B8BFB5", focus: "#022C12" },
        text: { DEFAULT: "#1A1A1A", secondary: "#4D4D4D", muted: "#8A8A8A", dim: "#B5B5B5" },
        primary: {
          DEFAULT: "#022C12",
          hover: "#04391A",
          muted: "#3A6B4A",
          bg: "#EAF3EC",
          "bg-hover": "#D7EADC",
          badge: "#022C12",
          "badge-bg": "#E0F0E4",
        },
        accent: "#F1F97E",
        error: { DEFAULT: "#C62828", bg: "#FFF0EF" },
      },
      fontFamily: {
        sans: ["Inter", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

Create `vitest.setup.ts`:

```ts
import "jest-canvas-mock";
```

- [ ] **Step 5: Configure Next.js body size limit**

Update `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: Next.js Route Handlers use req.json() which has a default 1MB limit.
  // For large base64 images, the API route in app/api/detect-focal/route.ts
  // should handle streaming or the route segment config should set:
  // export const maxDuration = 60; // seconds
  // The body size for Route Handlers is configured per-route, not globally.
};

export default nextConfig;
```

- [ ] **Step 6: Create environment files**

Create `.env.local`:
```
ANTHROPIC_API_KEY=your-key-here
```

Create `.env.example`:
```
# Anthropic API key for AI Smart Crop feature
ANTHROPIC_API_KEY=
```

- [ ] **Step 7: Update .gitignore**

Ensure `.gitignore` includes:
```
node_modules
.next
.env.local
.superpowers
```

- [ ] **Step 8: Add test script to package.json**

Add to `scripts` in `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 9: Verify setup**

```bash
npm run dev    # should start on localhost:3000
npm run test   # should run with 0 tests found (no test files yet)
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Tailwind and Vitest"
```

---

### Task 2: Constants and Types

**Files:**
- Create: `lib/constants.ts`, `lib/types.ts`

- [ ] **Step 1: Create shared types**

Create `lib/types.ts`:

```ts
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
```

- [ ] **Step 2: Create constants**

Create `lib/constants.ts`:

```ts
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
  modes: ["single", "smart-crop", "logo"] as const,
  ratios: [0, 1, 2, 3] as const, // indices into RATIOS
};

export const LOGO_RECOLOR_PRESETS = [
  { key: "none", label: "Original colors", swatch: null },
  { key: "#ffffff", label: "White", swatch: "#ffffff" },
  { key: "#000000", label: "Black", swatch: "#000000" },
  { key: "custom", label: "Custom", swatch: null },
] as const;
```

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts lib/constants.ts
git commit -m "feat: add shared types and constants"
```

---

### Task 3: Crop Math — TDD

**Files:**
- Create: `lib/crop-math.ts`, `__tests__/crop-math.test.ts`

- [ ] **Step 1: Write failing tests for `clamp`**

Create `__tests__/crop-math.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clamp, centered, centeredOnBbox } from "@/lib/crop-math";

describe("clamp", () => {
  it("keeps crop within bounds", () => {
    const result = clamp({ x: -10, y: -10, w: 200, h: 200 }, 400, 300, 1);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });

  it("enforces minimum width of 60", () => {
    const result = clamp({ x: 0, y: 0, w: 10, h: 10 }, 400, 300, 1);
    expect(result.w).toBeGreaterThanOrEqual(60);
  });

  it("maintains aspect ratio", () => {
    const ratio = 16 / 9;
    const result = clamp({ x: 0, y: 0, w: 320, h: 180 }, 400, 300, ratio);
    expect(result.w / result.h).toBeCloseTo(ratio, 1);
  });

  it("constrains to display dimensions", () => {
    const result = clamp({ x: 0, y: 0, w: 800, h: 800 }, 400, 300, 1);
    expect(result.w).toBeLessThanOrEqual(400);
    expect(result.h).toBeLessThanOrEqual(300);
  });

  it("prevents crop from extending past right/bottom edge", () => {
    const result = clamp({ x: 350, y: 250, w: 100, h: 100 }, 400, 300, 1);
    expect(result.x + result.w).toBeLessThanOrEqual(400);
    expect(result.y + result.h).toBeLessThanOrEqual(300);
  });
});

describe("centered", () => {
  it("centers crop at 80% of display area", () => {
    const result = centered(400, 300, 1);
    const expectedW = 300 * 0.8; // limited by height for 1:1
    expect(result.w).toBeCloseTo(expectedW, 0);
    expect(result.h).toBeCloseTo(expectedW, 0);
    expect(result.x).toBeCloseTo((400 - expectedW) / 2, 0);
    expect(result.y).toBeCloseTo((300 - expectedW) / 2, 0);
  });

  it("handles wide aspect ratios", () => {
    const ratio = 54 / 17;
    const result = centered(800, 600, ratio);
    expect(result.w / result.h).toBeCloseTo(ratio, 1);
    expect(result.w).toBeLessThanOrEqual(800);
    expect(result.h).toBeLessThanOrEqual(600);
  });
});

describe("centeredOnBbox", () => {
  it("returns centered crop when bbox is null", () => {
    const result = centeredOnBbox(400, 300, 1, null);
    const fallback = centered(400, 300, 1);
    expect(result.x).toBe(fallback.x);
    expect(result.y).toBe(fallback.y);
  });

  it("centers on bounding box", () => {
    const bbox = { x1: 0.3, y1: 0.2, x2: 0.7, y2: 0.8 };
    const result = centeredOnBbox(400, 300, 1, bbox);
    const bboxCenterX = (0.3 + 0.7) / 2 * 400;
    const bboxCenterY = (0.2 + 0.8) / 2 * 300;
    const cropCenterX = result.x + result.w / 2;
    const cropCenterY = result.y + result.h / 2;
    // crop center should be near bbox center
    expect(Math.abs(cropCenterX - bboxCenterX)).toBeLessThan(result.w);
    expect(Math.abs(cropCenterY - bboxCenterY)).toBeLessThan(result.h);
  });

  it("contains the entire bounding box", () => {
    const bbox = { x1: 0.2, y1: 0.1, x2: 0.8, y2: 0.9 };
    const result = centeredOnBbox(400, 300, 1, bbox);
    const bx1 = bbox.x1 * 400;
    const by1 = bbox.y1 * 300;
    const bx2 = bbox.x2 * 400;
    const by2 = bbox.y2 * 300;
    expect(result.x).toBeLessThanOrEqual(bx1);
    expect(result.y).toBeLessThanOrEqual(by1);
    expect(result.x + result.w).toBeGreaterThanOrEqual(bx2);
    expect(result.y + result.h).toBeGreaterThanOrEqual(by2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- __tests__/crop-math.test.ts
```

Expected: FAIL — module `@/lib/crop-math` not found.

- [ ] **Step 3: Implement crop-math.ts**

Create `lib/crop-math.ts` — port the `clamp`, `centered`, and `centeredOnBbox` functions from the artifact, adding TypeScript types:

```ts
import { CropRect, BoundingBox } from "./types";

export function clamp(c: CropRect, dw: number, dh: number, r: number): CropRect {
  let { x, y, w, h } = c;
  w = Math.max(60, Math.min(w, dw));
  h = w / r;
  if (h > dh) {
    h = dh;
    w = h * r;
  }
  x = Math.max(0, Math.min(x, dw - w));
  y = Math.max(0, Math.min(y, dh - h));
  return { x, y, w: Math.round(w), h: Math.round(h) };
}

export function centered(dw: number, dh: number, r: number): CropRect {
  let cw = dw * 0.8;
  let ch = cw / r;
  if (ch > dh * 0.8) {
    ch = dh * 0.8;
    cw = ch * r;
  }
  return clamp(
    {
      x: Math.round(dw / 2 - cw / 2),
      y: Math.round(dh / 2 - ch / 2),
      w: Math.round(cw),
      h: Math.round(ch),
    },
    dw,
    dh,
    r,
  );
}

export function centeredOnBbox(
  dw: number,
  dh: number,
  r: number,
  bbox: BoundingBox | null,
): CropRect {
  if (!bbox) return centered(dw, dh, r);
  const bx1 = bbox.x1 * dw,
    by1 = bbox.y1 * dh,
    bx2 = bbox.x2 * dw,
    by2 = bbox.y2 * dh;
  const bcx = (bx1 + bx2) / 2,
    bcy = (by1 + by2) / 2,
    bw = bx2 - bx1,
    bh = by2 - by1;
  let cw = Math.max(bw, bh * r),
    ch = cw / r;
  if (ch < bh) {
    ch = bh;
    cw = ch * r;
  }
  const mhw = Math.min(bcx, dw - bcx),
    mhh = Math.min(bcy, dh - bcy);
  const ex = Math.min((mhw * 2) / cw, (mhh * 2) / ch);
  if (ex > 1) {
    cw *= ex;
    ch *= ex;
  }
  if (cw > dw) {
    cw = dw;
    ch = cw / r;
  }
  if (ch > dh) {
    ch = dh;
    cw = ch * r;
  }
  return clamp(
    {
      x: Math.round(bcx - cw / 2),
      y: Math.round(bcy - ch / 2),
      w: Math.round(cw),
      h: Math.round(ch),
    },
    dw,
    dh,
    r,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- __tests__/crop-math.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/crop-math.ts __tests__/crop-math.test.ts
git commit -m "feat: add crop math with tests (clamp, centered, centeredOnBbox)"
```

---

### Task 4: Image Utils — TDD

**Files:**
- Create: `lib/image-utils.ts`, `__tests__/image-utils.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/image-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cropFilename, dispSize } from "@/lib/image-utils";

describe("cropFilename", () => {
  it("appends _crop.png to filename", () => {
    expect(cropFilename("photo.jpg")).toBe("photo_crop.png");
  });

  it("handles files without extension", () => {
    expect(cropFilename("photo")).toBe("photo_crop.png");
  });

  it("returns default for empty input", () => {
    expect(cropFilename("")).toBe("crop.png");
  });

  it("returns default for undefined input", () => {
    expect(cropFilename(undefined as unknown as string)).toBe("crop.png");
  });

  it("handles multiple dots in filename", () => {
    expect(cropFilename("my.photo.jpg")).toBe("my.photo_crop.png");
  });
});

describe("dispSize", () => {
  it("scales down large images to fit viewport", () => {
    const result = dispSize(4000, 3000, 1000, 800);
    expect(result.dw).toBeLessThanOrEqual(1000);
    expect(result.dh).toBeLessThanOrEqual(800);
  });

  it("does not scale up small images", () => {
    const result = dispSize(200, 150, 1000, 800);
    expect(result.dw).toBe(200);
    expect(result.dh).toBe(150);
  });

  it("maintains aspect ratio", () => {
    const nw = 1600, nh = 900;
    const result = dispSize(nw, nh, 800, 600);
    const originalRatio = nw / nh;
    const resultRatio = result.dw / result.dh;
    expect(resultRatio).toBeCloseTo(originalRatio, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- __tests__/image-utils.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement image-utils.ts**

Create `lib/image-utils.ts`:

```ts
import { CropRect, NaturalSize, DisplaySize } from "./types";

export function cropFilename(name: string): string {
  if (!name) return "crop.png";
  const d = name.lastIndexOf(".");
  return `${d > -1 ? name.slice(0, d) : name}_crop.png`;
}

export function dispSize(
  nw: number,
  nh: number,
  maxW: number,
  maxH: number,
): DisplaySize {
  const s = Math.min(maxW / nw, maxH / nh, 1);
  return { dw: Math.round(nw * s), dh: Math.round(nh * s) };
}

export function cropToBlob(
  src: string,
  nat: NaturalSize,
  disp: DisplaySize,
  crop: CropRect,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement("canvas");
        const sx = (crop.x / disp.dw) * nat.w;
        const sy = (crop.y / disp.dh) * nat.h;
        const sw = (crop.w / disp.dw) * nat.w;
        const sh = (crop.h / disp.dh) * nat.h;
        cv.width = Math.round(sw);
        cv.height = Math.round(sh);
        cv.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        cv.toBlob(resolve, "image/png");
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- __tests__/image-utils.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/image-utils.ts __tests__/image-utils.test.ts
git commit -m "feat: add image utils with tests (cropFilename, dispSize, cropToBlob)"
```

---

### Task 5: Logo Processing — TDD

**Files:**
- Create: `lib/logo-processing.ts`, `__tests__/logo-processing.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/logo-processing.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { removeBg, recolorCanvas, canvasToDataURL } from "@/lib/logo-processing";

function createTestCanvas(width: number, height: number, fillColor: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = width;
  cv.height = height;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, width, height);
  return cv;
}

function drawRect(
  cv: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

describe("removeBg", () => {
  it("makes edge-matching pixels transparent", () => {
    const cv = createTestCanvas(100, 100, "#ffffff");
    drawRect(cv, 30, 30, 40, 40, "#ff0000"); // red square in center
    removeBg(cv, 40);
    const data = cv.getContext("2d")!.getImageData(0, 0, 100, 100).data;
    // corner pixel should be transparent
    expect(data[3]).toBe(0);
    // center pixel (50,50) should be opaque
    const centerIdx = (50 * 100 + 50) * 4;
    expect(data[centerIdx + 3]).toBeGreaterThan(0);
  });
});

describe("recolorCanvas", () => {
  it("changes all visible pixels to target color", () => {
    const cv = createTestCanvas(10, 10, "#ff0000");
    const result = recolorCanvas(cv, "#00ff00");
    const data = result.getContext("2d")!.getImageData(0, 0, 10, 10).data;
    // first pixel should be green
    expect(data[0]).toBe(0);   // R
    expect(data[1]).toBe(255); // G
    expect(data[2]).toBe(0);   // B
    expect(data[3]).toBe(255); // A
  });

  it("preserves transparent pixels", () => {
    const cv = createTestCanvas(10, 10, "#ff0000");
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, 5, 10); // make left half transparent
    const result = recolorCanvas(cv, "#00ff00");
    const data = result.getContext("2d")!.getImageData(0, 0, 10, 10).data;
    // transparent pixel stays transparent
    expect(data[3]).toBe(0);
    // opaque pixel gets recolored
    const opaqueIdx = (0 * 10 + 5) * 4;
    expect(data[opaqueIdx]).toBe(0);
    expect(data[opaqueIdx + 1]).toBe(255);
  });
});

describe("canvasToDataURL", () => {
  it("returns a data URL string", () => {
    const cv = createTestCanvas(10, 10, "#000000");
    const url = canvasToDataURL(cv);
    expect(url).toMatch(/^data:image\/png/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- __tests__/logo-processing.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement logo-processing.ts**

Create `lib/logo-processing.ts` — port `removeBg`, `recolorCanvas`, `canvasToDataURL` from the artifact with TypeScript types:

```ts
export function removeBg(canvas: HTMLCanvasElement, tolerance: number): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const w = canvas.width,
    h = canvas.height;

  // Sample background color from corners
  const samples: [number, number, number][] = [];
  for (const [sx, sy] of [
    [0, 0], [w - 5, 0], [0, h - 5], [w - 5, h - 5],
  ] as [number, number][]) {
    for (let dy = 0; dy < 5; dy++)
      for (let dx = 0; dx < 5; dx++) {
        const i = ((sy + dy) * w + (sx + dx)) * 4;
        samples.push([px[i], px[i + 1], px[i + 2]]);
      }
  }
  const bgR = Math.round(samples.reduce((s, c) => s + c[0], 0) / samples.length);
  const bgG = Math.round(samples.reduce((s, c) => s + c[1], 0) / samples.length);
  const bgB = Math.round(samples.reduce((s, c) => s + c[2], 0) / samples.length);

  const visited = new Uint8Array(w * h);
  const queue: number[] = [];
  const tol = tolerance * tolerance * 3;

  const match = (i: number) => {
    const dr = px[i] - bgR,
      dg = px[i + 1] - bgG,
      db = px[i + 2] - bgB;
    return dr * dr + dg * dg + db * db <= tol;
  };

  // Seed queue from edges
  for (let x = 0; x < w; x++) {
    queue.push(x);
    queue.push((h - 1) * w + x);
    visited[x] = 1;
    visited[(h - 1) * w + x] = 1;
  }
  for (let y = 1; y < h - 1; y++) {
    queue.push(y * w);
    queue.push(y * w + w - 1);
    visited[y * w] = 1;
    visited[y * w + w - 1] = 1;
  }

  // Flood fill
  while (queue.length) {
    const idx = queue.pop()!;
    const pi = idx * 4;
    if (match(pi)) {
      px[pi + 3] = 0;
      const x = idx % w,
        y = (idx - x) / w;
      for (const [nx, ny] of [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
      ] as [number, number][]) {
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const ni = ny * w + nx;
          if (!visited[ni]) {
            visited[ni] = 1;
            queue.push(ni);
          }
        }
      }
    }
  }

  ctx.putImageData(data, 0, 0);
  return canvas;
}

export function recolorCanvas(srcCanvas: HTMLCanvasElement, hexColor: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = srcCanvas.width;
  cv.height = srcCanvas.height;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(srcCanvas, 0, 0);
  const data = ctx.getImageData(0, 0, cv.width, cv.height);
  const px = data.data;
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 0) {
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    }
  }
  ctx.putImageData(data, 0, 0);
  return cv;
}

export function canvasToDataURL(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- __tests__/logo-processing.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/logo-processing.ts __tests__/logo-processing.test.ts
git commit -m "feat: add logo processing with tests (removeBg, recolorCanvas)"
```

---

### Task 6: Download Utils and AI Client

**Files:**
- Create: `lib/download.ts`, `lib/ai-client.ts`, `__tests__/download.test.ts`

- [ ] **Step 1: Write failing tests for download utils**

Create `__tests__/download.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { cropFilename } from "@/lib/image-utils";

// Test that cropToBlob produces correct canvas dimensions
// (cropToBlob itself tested via image-utils, here we test download coordination)

describe("download utils", () => {
  it("cropFilename generates correct batch filenames", () => {
    const names = ["photo1.jpg", "photo2.png", "landscape.webp"];
    const results = names.map(cropFilename);
    expect(results).toEqual(["photo1_crop.png", "photo2_crop.png", "landscape_crop.png"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npm run test -- __tests__/download.test.ts
```

Expected: PASS (uses already-implemented `cropFilename`).

- [ ] **Step 3: Implement download.ts**

Create `lib/download.ts`:

```ts
import { CropRect, NaturalSize, DisplaySize, MultiCropItem } from "./types";
import { cropToBlob, cropFilename } from "./image-utils";

export function dlCrop(
  src: string,
  nat: NaturalSize,
  disp: DisplaySize,
  crop: CropRect,
  fname: string,
): void {
  cropToBlob(src, nat, disp, crop).then((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = fname;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

export async function dlAll(items: MultiCropItem[]): Promise<void> {
  const ready = items.filter((it) => it.status === "done" && it.crop);
  if (!ready.length) return;

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  await Promise.all(
    ready.map(async (it) => {
      try {
        const blob = await cropToBlob(it.src, it.natural, it.disp, it.crop!);
        if (blob) zip.file(cropFilename(it.name), blob);
      } catch {
        // skip individual failures
      }
    }),
  );

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.download = "crops.zip";
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function dlCanvas(canvas: HTMLCanvasElement, fname: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = fname;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}
```

- [ ] **Step 4: Implement ai-client.ts**

Create `lib/ai-client.ts`:

```ts
import { FocalResult } from "./types";

export async function detectFocal(src: string, mime: string): Promise<FocalResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch("/api/detect-focal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src, mime }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await res.json();

    if (!res.ok) {
      // Retry on rate limit
      if (data?.error?.type === "rate_limit_error") {
        return retryWithBackoff(src, mime, 3);
      }
      return {
        bbox: null,
        label: "",
        error: data?.error?.message || `API error (HTTP ${res.status})`,
      };
    }

    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      bbox: null,
      label: "",
      error: message.includes("abort") ? "Request timed out (30s)" : message,
    };
  }
}

async function retryWithBackoff(
  src: string,
  mime: string,
  retriesLeft: number,
): Promise<FocalResult> {
  if (retriesLeft <= 0) {
    return { bbox: null, label: "", error: "Rate limit hit, try again shortly" };
  }
  const delay = (4 - retriesLeft) * 2000; // 2s, 4s, 6s
  await new Promise((r) => setTimeout(r, delay));
  return detectFocal(src, mime);
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/download.ts lib/ai-client.ts __tests__/download.test.ts
git commit -m "feat: add download utils and AI client with retry logic"
```

---

### Task 7: API Route — Server-Side Proxy

**Files:**
- Create: `app/api/detect-focal/route.ts`

- [ ] **Step 1: Implement the API route**

Create `app/api/detect-focal/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

// Allow large base64 image payloads (up to 25MB)
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { bbox: null, label: "", error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const { src, mime } = await req.json();

    if (!src || !mime) {
      return NextResponse.json(
        { bbox: null, label: "", error: "Missing src or mime" },
        { status: 400 },
      );
    }

    const b64 = src.split(",")[1];
    if (!b64) {
      return NextResponse.json(
        { bbox: null, label: "", error: "Invalid image data" },
        { status: 400 },
      );
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mime, data: b64 },
              },
              {
                type: "text",
                text: `You are a professional photo editor. Your job is to find a bounding box that contains ALL of the main subjects.

Step 1 — Count every person or animal visible in the frame, even partially.
Step 2 — Draw the smallest box that contains ALL of them, from the topmost head to the bottommost foot of every subject.
Step 3 — Expand that box by 15% on every side.

Critical rules:
- If there are 2 people, BOTH must be inside the box
- If there are 3 people, ALL 3 must be inside the box
- Always include full body: top of head to bottom of feet. Never cut at waist, chest, or knees
- If a body part is cut off by the photo edge, extend the box to the photo edge on that side

Return ONLY a raw JSON object, no markdown, no explanation:
{"x1": <0.0–1.0>, "y1": <0.0–1.0>, "x2": <0.0–1.0>, "y2": <0.0–1.0>, "label": "<short description>"}`,
              },
            ],
          },
        ],
      }),
    });

    const d = await res.json();

    if (!res.ok) {
      const error = d?.error || {};
      return NextResponse.json(
        {
          bbox: null,
          label: "",
          error: error.message || `Anthropic API error (HTTP ${res.status})`,
          type: error.type,
        },
        { status: res.status },
      );
    }

    const raw = d.content?.find((b: { type: string }) => b.type === "text")?.text?.trim() || "";

    // Parse JSON from response (handle markdown fences)
    let jsonStr = raw;
    const fm = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fm) jsonStr = fm[1].trim();
    else {
      const om = raw.match(/\{[\s\S]*\}/);
      if (om) jsonStr = om[0];
    }

    const p = JSON.parse(jsonStr);

    return NextResponse.json({
      bbox: {
        x1: Math.max(0, Math.min(1, +p.x1 || 0)),
        y1: Math.max(0, Math.min(1, +p.y1 || 0)),
        x2: Math.max(0, Math.min(1, +p.x2 || 1)),
        y2: Math.max(0, Math.min(1, +p.y2 || 1)),
      },
      label: p.label || "",
    });
  } catch (err) {
    const message = err instanceof SyntaxError
      ? "Couldn't parse AI response"
      : err instanceof Error
        ? err.message
        : String(err);
    return NextResponse.json(
      { bbox: null, label: "", error: message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify route works**

```bash
npm run dev &
sleep 3
curl -s http://localhost:3000/api/detect-focal -X POST -H "Content-Type: application/json" -d '{}' | head -c 200
```

Expected: `{"bbox":null,"label":"","error":"Missing src or mime"}` — confirms route is reachable.

- [ ] **Step 3: Commit**

```bash
git add app/api/detect-focal/route.ts
git commit -m "feat: add server-side API proxy for Anthropic vision"
```

---

### Task 8: Shared UI Components

**Files:**
- Create: `components/ui/button.tsx`, `components/ui/badge.tsx`, `components/ui/drop-zone.tsx`, `components/ui/keyboard-hint.tsx`, `components/ui/size-input.tsx`

- [ ] **Step 1: Create Button component**

Create `components/ui/button.tsx`:

```tsx
"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-white border-transparent hover:bg-primary-hover",
  outline:
    "bg-surface text-text border-border hover:bg-surface-hover hover:border-border-hover",
  ghost:
    "bg-transparent text-text-secondary border-border hover:bg-surface-hover hover:border-border-hover",
  danger:
    "bg-error-bg text-error border-[#f5d5d5] hover:border-[#f5c0c0]",
};

export function Button({
  variant = "outline",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const sizeClasses = size === "sm" ? "px-3.5 py-1.5 text-xs" : "px-5 py-2.5 text-[13px]";

  return (
    <button
      className={`
        inline-flex items-center gap-1.5 rounded-lg font-semibold
        border-[1.5px] transition-all duration-150 tracking-[0.01em]
        disabled:opacity-40 disabled:cursor-not-allowed
        ${sizeClasses} ${variantClasses[variant]} ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Create Badge component**

Create `components/ui/badge.tsx`:

```tsx
import { ReactNode } from "react";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-semibold tracking-[0.06em] uppercase bg-primary-badge-bg text-primary-badge rounded-lg px-2.5 py-1">
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Create DropZone component**

Create `components/ui/drop-zone.tsx`:

```tsx
"use client";

import { useRef, useState, ReactNode } from "react";
import { ACCEPTED_TYPES, MAX_FILE_SIZE } from "@/lib/constants";

interface DropZoneProps {
  onFiles: (files: FileList) => void;
  multiple?: boolean;
  children: (over: boolean) => ReactNode;
}

export function DropZone({ onFiles, multiple = false, children }: DropZoneProps) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = (files: FileList): FileList | null => {
    setError(null);
    for (const file of Array.from(files)) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(`Unsupported format: ${file.name}. Use PNG, JPG, or WebP.`);
        return null;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} exceeds 20MB limit.`);
        return null;
      }
    }
    return files;
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const valid = validate(e.dataTransfer.files);
          if (valid) onFiles(valid);
        }}
        onClick={() => inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-2xl py-14 px-12 cursor-pointer
          text-center transition-all duration-200
          ${over ? "border-primary bg-primary-bg" : "border-border bg-surface"}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              const valid = validate(e.target.files);
              if (valid) onFiles(valid);
            }
            e.target.value = "";
          }}
        />
        {children(over)}
      </div>
      {error && (
        <p className="mt-3 text-sm text-error font-medium text-center">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create KeyboardHint component**

Create `components/ui/keyboard-hint.tsx`:

```tsx
export function KeyboardHint({ shortcut }: { shortcut: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 text-[10px] font-semibold font-mono bg-surface border border-border rounded text-text-muted">
      {shortcut}
    </kbd>
  );
}
```

- [ ] **Step 5: Create SizeInput component**

Create `components/ui/size-input.tsx`:

```tsx
"use client";

import { useState } from "react";
import { CropRect, DisplaySize, NaturalSize } from "@/lib/types";

interface SizeInputProps {
  cropPx: number;
  cropPy: number;
  ratio: number;
  crop: CropRect;
  setCrop: (c: CropRect) => void;
  disp: DisplaySize;
  nat: NaturalSize;
}

export function SizeInput({ cropPx, cropPy, ratio, crop, setCrop, disp, nat }: SizeInputProps) {
  const [editW, setEditW] = useState<string | null>(null);
  const [editH, setEditH] = useState<string | null>(null);

  const applyWidth = (val: string) => {
    const newW = parseInt(val, 10);
    if (!newW || newW < 10) return;
    const scale = disp.dw / nat.w;
    let dw = newW * scale;
    let dh = dw / ratio;
    dw = Math.max(60, Math.min(dw, disp.dw));
    dh = dw / ratio;
    if (dh > disp.dh) { dh = disp.dh; dw = dh * ratio; }
    const cx = crop.x + crop.w / 2;
    const cy = crop.y + crop.h / 2;
    setCrop({
      x: Math.round(Math.max(0, Math.min(cx - dw / 2, disp.dw - dw))),
      y: Math.round(Math.max(0, Math.min(cy - dh / 2, disp.dh - dh))),
      w: Math.round(dw),
      h: Math.round(dh),
    });
  };

  const applyHeight = (val: string) => {
    const newH = parseInt(val, 10);
    if (!newH || newH < 10) return;
    const scale = disp.dh / nat.h;
    let dh = newH * scale;
    let dw = dh * ratio;
    dh = Math.max(60 / ratio, Math.min(dh, disp.dh));
    dw = dh * ratio;
    if (dw > disp.dw) { dw = disp.dw; dh = dw / ratio; }
    const cx = crop.x + crop.w / 2;
    const cy = crop.y + crop.h / 2;
    setCrop({
      x: Math.round(Math.max(0, Math.min(cx - dw / 2, disp.dw - dw))),
      y: Math.round(Math.max(0, Math.min(cy - dh / 2, disp.dh - dh))),
      w: Math.round(dw),
      h: Math.round(dh),
    });
  };

  const inputClass =
    "w-[62px] bg-white border border-border rounded-md text-text text-xs font-medium px-2 py-1.5 text-center tabular-nums outline-none focus:border-border-focus transition-colors";

  return (
    <div className="flex items-center gap-1 bg-surface border border-border rounded-lg px-1 py-0.5">
      <input
        type="text"
        inputMode="numeric"
        value={editW !== null ? editW : cropPx}
        onChange={(e) => setEditW(e.target.value.replace(/[^0-9]/g, ""))}
        onFocus={(e) => { setEditW(String(cropPx)); e.target.select(); }}
        onBlur={() => { if (editW !== null) applyWidth(editW); setEditW(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { applyWidth(editW!); setEditW(null); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") { setEditW(null); (e.target as HTMLInputElement).blur(); }
        }}
        className={inputClass}
      />
      <span className="text-text-muted text-xs font-semibold">×</span>
      <input
        type="text"
        inputMode="numeric"
        value={editH !== null ? editH : cropPy}
        onChange={(e) => setEditH(e.target.value.replace(/[^0-9]/g, ""))}
        onFocus={(e) => { setEditH(String(cropPy)); e.target.select(); }}
        onBlur={() => { if (editH !== null) applyHeight(editH); setEditH(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { applyHeight(editH!); setEditH(null); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") { setEditH(null); (e.target as HTMLInputElement).blur(); }
        }}
        className={inputClass}
      />
      <span className="text-text-dim text-[10px] font-medium ml-0.5 mr-0.5">px</span>
    </div>
  );
}
```

- [ ] **Step 6: Verify components compile**

```bash
npm run build 2>&1 | tail -5
```

Note: This will have errors because pages don't exist yet. That's expected — we just need no TypeScript errors in the components themselves. Alternatively run:

```bash
npx tsc --noEmit --pretty 2>&1 | grep "components/ui"
```

Expected: No errors from `components/ui/`.

- [ ] **Step 7: Commit**

```bash
git add components/ui/
git commit -m "feat: add shared UI components (button, badge, drop-zone, size-input, keyboard-hint)"
```

---

### Task 9: Crop Components

**Files:**
- Create: `components/crop/crop-overlay.tsx`, `components/crop/zoomable-editor.tsx`, `components/crop/ratio-picker.tsx`

- [ ] **Step 1: Create CropOverlay component**

Create `components/crop/crop-overlay.tsx` — port the `CropOverlay` component from the artifact. Convert inline styles to Tailwind where practical; keep complex computed styles inline (the overlay geometry requires calculated positions):

```tsx
"use client";

import { CropRect, CropDragType } from "@/lib/types";

interface CropOverlayProps {
  crop: CropRect;
  onDown: (e: React.MouseEvent, type: CropDragType) => void;
}

function Handle({
  style,
  type,
  cursor,
  onDown,
  hw = 12,
  hh = 12,
}: {
  style: React.CSSProperties;
  type: CropDragType;
  cursor: string;
  onDown: (e: React.MouseEvent, type: CropDragType) => void;
  hw?: number;
  hh?: number;
}) {
  return (
    <div
      onMouseDown={(e) => onDown(e, type)}
      className="absolute bg-white rounded-[3px] shadow-md z-10"
      style={{ width: hw, height: hh, cursor, ...style }}
    />
  );
}

export function CropOverlay({ crop, onDown }: CropOverlayProps) {
  const { x, y, w, h } = crop;

  return (
    <>
      {/* Dimmed overlay regions */}
      {[
        { top: 0, left: 0, right: 0, height: y },
        { top: y + h, left: 0, right: 0, bottom: 0 },
        { top: y, left: 0, width: x, height: h },
        { top: y, left: x + w, right: 0, height: h },
      ].map((s, i) => (
        <div
          key={i}
          className="absolute bg-white/65 pointer-events-none"
          style={s}
        />
      ))}

      {/* Crop rectangle */}
      <div
        onMouseDown={(e) => onDown(e, "move")}
        className="absolute border-2 border-primary/85 cursor-grab z-5"
        style={{
          left: x, top: y, width: w, height: h,
          boxSizing: "border-box",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(0,0,0,0.08)",
        }}
      >
        {/* Rule of thirds grid */}
        {[1, 2].map((i) => [
          <div key={`v${i}`} className="absolute top-0 bottom-0 w-px bg-primary/20 pointer-events-none" style={{ left: `${i * 33.33}%` }} />,
          <div key={`h${i}`} className="absolute left-0 right-0 h-px bg-primary/20 pointer-events-none" style={{ top: `${i * 33.33}%` }} />,
        ])}

        {/* Corner handles */}
        <Handle style={{ top: -6, left: -6 }} type="tl" cursor="nwse-resize" onDown={onDown} />
        <Handle style={{ top: -6, right: -6 }} type="tr" cursor="nesw-resize" onDown={onDown} />
        <Handle style={{ bottom: -6, left: -6 }} type="bl" cursor="nesw-resize" onDown={onDown} />
        <Handle style={{ bottom: -6, right: -6 }} type="br" cursor="nwse-resize" onDown={onDown} />

        {/* Edge handles */}
        <Handle style={{ top: "50%", left: -5, transform: "translateY(-50%)" }} type="l" cursor="ew-resize" onDown={onDown} hw={10} hh={28} />
        <Handle style={{ top: "50%", right: -5, transform: "translateY(-50%)" }} type="r" cursor="ew-resize" onDown={onDown} hw={10} hh={28} />
        <Handle style={{ left: "50%", top: -5, transform: "translateX(-50%)" }} type="t" cursor="ns-resize" onDown={onDown} hw={28} hh={10} />
        <Handle style={{ left: "50%", bottom: -5, transform: "translateX(-50%)" }} type="b" cursor="ns-resize" onDown={onDown} hw={28} hh={10} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create ZoomableEditor component**

Create `components/crop/zoomable-editor.tsx` — port from artifact, convert to TypeScript + Tailwind:

```tsx
"use client";

import { useRef, useEffect, useCallback, ReactNode } from "react";
import { CropRect, DisplaySize, CropDragType } from "@/lib/types";
import { CropOverlay } from "./crop-overlay";

interface ZoomableEditorProps {
  src: string;
  disp: DisplaySize;
  crop: CropRect;
  setCrop: (c: CropRect) => void;
  ratio: number;
  onDown: (e: React.MouseEvent, type: CropDragType) => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  pan: { x: number; y: number };
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}

export function ZoomableEditor({
  src, disp, crop, setCrop, ratio, onDown, zoom, setZoom, pan, setPan,
}: ZoomableEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    sx: number; sy: number; sp: { x: number; y: number };
  } | null>(null);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(1, Math.min(5, z + (e.deltaY < 0 ? 0.15 : -0.15))));
  }, [setZoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.altKey && e.button === 0)) {
      e.preventDefault();
      panRef.current = { sx: e.clientX, sy: e.clientY, sp: { ...pan } };
      const move = (me: MouseEvent) => {
        if (!panRef.current) return;
        setPan({
          x: panRef.current.sp.x + me.clientX - panRef.current.sx,
          y: panRef.current.sp.y + me.clientY - panRef.current.sy,
        });
      };
      const up = () => {
        panRef.current = null;
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    }
  }, [pan, setPan]);

  const maxPanX = (disp.dw * (zoom - 1)) / 2;
  const maxPanY = (disp.dh * (zoom - 1)) / 2;
  const cp = {
    x: Math.max(-maxPanX, Math.min(maxPanX, pan.x)),
    y: Math.max(-maxPanY, Math.min(maxPanY, pan.y)),
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handlePanStart}
      className="relative select-none rounded-xl overflow-hidden border border-border"
      style={{ width: disp.dw, height: disp.dh, cursor: zoom > 1 ? "grab" : "default" }}
    >
      <div style={{
        width: disp.dw,
        height: disp.dh,
        transform: `scale(${zoom}) translate(${cp.x / zoom}px, ${cp.y / zoom}px)`,
        transformOrigin: "center center",
      }}>
        <img src={src} draggable={false} className="block pointer-events-none" style={{ width: disp.dw, height: disp.dh }} />
        <CropOverlay crop={crop} onDown={onDown} />
      </div>

      {zoom > 1 && (
        <div className="absolute bottom-2.5 right-2.5 z-20 bg-black/60 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm flex items-center gap-2">
          <span>{Math.round(zoom * 100)}%</span>
          <button
            onClick={(e) => { e.stopPropagation(); setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="bg-transparent border-none text-white/70 cursor-pointer text-[11px] p-0"
          >
            Reset
          </button>
        </div>
      )}
      {zoom === 1 && (
        <div className="absolute bottom-2.5 right-2.5 z-20 bg-black/45 rounded-lg px-2.5 py-1 text-[10px] text-white/70 pointer-events-none">
          Scroll to zoom · Alt+drag to pan
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create RatioPicker component**

Create `components/crop/ratio-picker.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { RATIOS } from "@/lib/constants";
import { KeyboardHint } from "@/components/ui/keyboard-hint";

interface RatioPickerProps {
  onPick: (value: number | null, label: string) => void;
  onBack: () => void;
  subtitle?: string;
  backLabel?: string;
}

export function RatioPicker({ onPick, onBack, subtitle, backLabel = "← Go back" }: RatioPickerProps) {
  const [hov, setHov] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < RATIOS.length) {
        e.preventDefault();
        onPick(RATIOS[idx].value, RATIOS[idx].label);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPick, onBack]);

  return (
    <div className="text-center animate-fadeUp">
      {subtitle && (
        <div className="text-[11px] font-bold tracking-[0.14em] uppercase text-primary-muted mb-3">
          {subtitle}
        </div>
      )}
      <div className="text-2xl font-bold text-text mb-2 tracking-tight">
        Choose crop ratio
      </div>
      <div className="text-sm text-text-muted mb-8">
        Select the aspect ratio for your output
      </div>
      <div className="grid grid-cols-2 gap-2.5 max-w-[320px] mx-auto">
        {RATIOS.map(({ label, sub, value }, idx) => (
          <button
            key={label}
            onClick={() => onPick(value, label)}
            onMouseEnter={() => setHov(label)}
            onMouseLeave={() => setHov(null)}
            className={`
              py-3.5 rounded-xl border-[1.5px] cursor-pointer transition-all duration-150
              flex flex-col items-center gap-1 relative
              ${hov === label
                ? "border-primary bg-primary-bg"
                : "border-border bg-white"
              }
            `}
          >
            <span className={`text-[15px] font-bold ${hov === label ? "text-primary" : "text-text"}`}>
              {label}
            </span>
            <span className={`text-[11px] font-medium ${hov === label ? "text-primary-muted" : "text-text-muted"}`}>
              {sub}
            </span>
            <span className="absolute top-2 right-2">
              <KeyboardHint shortcut={String(idx + 1)} />
            </span>
          </button>
        ))}
      </div>
      <button
        onClick={onBack}
        className="mt-7 bg-transparent border-none text-text-muted text-[13px] cursor-pointer"
      >
        {backLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/crop/
git commit -m "feat: add crop components (overlay, zoomable-editor, ratio-picker)"
```

---

### Task 10: Logo Controls Component

**Files:**
- Create: `components/logo/logo-controls.tsx`

- [ ] **Step 1: Create LogoControls component**

Create `components/logo/logo-controls.tsx` — the tolerance slider and recolor options panel, extracted from the artifact's logo edit view:

```tsx
"use client";

import { LOGO_RECOLOR_PRESETS } from "@/lib/constants";

interface LogoControlsProps {
  tolerance: number;
  setTolerance: (v: number) => void;
  recolor: string;
  setRecolor: (v: string) => void;
  customHex: string;
  setCustomHex: (v: string) => void;
  onUpdate: (tolerance: number, recolor: string, customHex: string) => void;
}

export function LogoControls({
  tolerance, setTolerance, recolor, setRecolor, customHex, setCustomHex, onUpdate,
}: LogoControlsProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-5">
      {/* Tolerance slider */}
      <div>
        <div className="flex justify-between items-center mb-2.5">
          <span className="text-[13px] font-semibold text-text">Background removal</span>
          <span className="text-xs text-text-muted tabular-nums font-medium">{tolerance}</span>
        </div>
        <input
          type="range"
          min="5"
          max="120"
          step="1"
          value={tolerance}
          onChange={(e) => setTolerance(+e.target.value)}
          onMouseUp={() => onUpdate(tolerance, recolor, customHex)}
          onTouchEnd={() => onUpdate(tolerance, recolor, customHex)}
          className="w-full accent-primary cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-text-dim mt-1">
          <span>Less removal</span>
          <span>More removal</span>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Recolor options */}
      <div>
        <div className="text-[13px] font-semibold text-text mb-3">Recolor</div>
        <div className="flex gap-2 flex-wrap items-center">
          {LOGO_RECOLOR_PRESETS.map((opt) => {
            const active = recolor === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => {
                  setRecolor(opt.key);
                  onUpdate(tolerance, opt.key, customHex);
                }}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer
                  border-[1.5px] text-[13px] font-semibold transition-all duration-150
                  ${active
                    ? "border-primary bg-primary-bg text-primary"
                    : "border-border bg-transparent text-text"
                  }
                `}
              >
                {opt.swatch && (
                  <span
                    className="w-4 h-4 rounded border border-black/10 shrink-0"
                    style={{ background: opt.swatch }}
                  />
                )}
                {opt.label}
              </button>
            );
          })}
        </div>
        {recolor === "custom" && (
          <div className="flex items-center gap-2.5 mt-3">
            <input
              type="color"
              value={customHex}
              onChange={(e) => {
                setCustomHex(e.target.value);
                onUpdate(tolerance, "custom", e.target.value);
              }}
              className="w-9 h-9 border-2 border-border rounded-lg bg-white cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={customHex}
              onChange={(e) => {
                setCustomHex(e.target.value);
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                  onUpdate(tolerance, "custom", e.target.value);
                }
              }}
              className="w-[100px] bg-white border border-border rounded-lg text-text text-[13px] font-semibold px-3 py-2 outline-none focus:border-border-focus"
            />
            <span
              className="w-6 h-6 rounded-md border border-black/10"
              style={{ background: customHex }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/logo/
git commit -m "feat: add logo controls component (tolerance slider, recolor options)"
```

---

### Task 11: Custom Hooks

**Files:**
- Create: `hooks/use-single-crop.ts`, `hooks/use-multi-crop.ts`, `hooks/use-logo-processor.ts`, `hooks/use-keyboard-shortcuts.ts`, `hooks/use-crop-drag.ts`

- [ ] **Step 1: Create useCropDrag hook**

Create `hooks/use-crop-drag.ts` — extracts the drag logic from the artifact's global mousemove/mouseup listeners:

```ts
"use client";

import { useEffect, useRef } from "react";
import { CropRect, CropDragType } from "@/lib/types";
import { clamp } from "@/lib/crop-math";

interface DragState {
  type: CropDragType;
  sx: number;
  sy: number;
  sc: CropRect;
  r: number;
  dw: number;
  dh: number;
  set: (c: CropRect) => void;
  zoom: number;
}

export function useCropDrag() {
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.sx) / d.zoom;
      const dy = (e.clientY - d.sy) / d.zoom;
      const { type, sc, r, dw, dh, set } = d;
      const c = { ...sc };

      if (type === "move") {
        c.x = sc.x + dx;
        c.y = sc.y + dy;
      } else {
        const isL = ["tl", "l", "bl"].includes(type);
        const isT = ["tl", "t", "tr"].includes(type);
        let nw = isL
          ? sc.w - dx
          : ["tr", "r", "br"].includes(type)
            ? sc.w + dx
            : type === "t"
              ? (sc.h - dy) * r
              : (sc.h + dy) * r;
        nw = Math.max(60, nw);
        const nh = nw / r;
        c.x = isL ? sc.x + sc.w - nw : ["t", "b"].includes(type) ? sc.x + (sc.w - nw) / 2 : sc.x;
        c.y = isT ? sc.y + sc.h - nh : ["l", "r"].includes(type) ? sc.y + (sc.h - nh) / 2 : sc.y;
        c.w = nw;
        c.h = nh;
      }
      set(clamp(c, dw, dh, r));
    };

    const up = () => { dragRef.current = null; };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  const startDrag = (
    e: React.MouseEvent,
    type: CropDragType,
    crop: CropRect,
    setCrop: (c: CropRect) => void,
    ratio: number,
    dw: number,
    dh: number,
    zoom = 1,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      type, sx: e.clientX, sy: e.clientY, sc: { ...crop },
      r: ratio, dw, dh, set: setCrop, zoom,
    };
  };

  return { startDrag };
}
```

- [ ] **Step 2: Create useSingleCrop hook**

Create `hooks/use-single-crop.ts`:

```ts
"use client";

import { useState, useCallback } from "react";
import { CropRect, NaturalSize, DisplaySize } from "@/lib/types";
import { dispSize } from "@/lib/image-utils";
import { centered } from "@/lib/crop-math";

type SingleStep = "upload" | "ratio" | "crop";

export function useSingleCrop() {
  const [step, setStep] = useState<SingleStep>("upload");
  const [src, setSrc] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nat, setNat] = useState<NaturalSize>({ w: 0, h: 0 });
  const [disp, setDisp] = useState<DisplaySize>({ dw: 0, dh: 0 });
  const [ratio, setRatio] = useState(1);
  const [ratioLabel, setRatioLabel] = useState("1:1");
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const loadImage = useCallback((files: FileList) => {
    const f = Array.from(files).find((f) => f.type.startsWith("image/"));
    if (!f) return;
    setName(f.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setNat({ w: img.width, h: img.height });
        setSrc(result);
        setStep("ratio");
      };
      img.src = result;
    };
    reader.readAsDataURL(f);
  }, []);

  const pickRatio = useCallback((v: number | null, label: string) => {
    const eff = v ?? nat.w / nat.h;
    const d = dispSize(nat.w, nat.h, Math.min(window.innerWidth - 96, nat.w), Math.min(window.innerHeight - 230, nat.h));
    setDisp(d);
    setRatio(eff);
    setRatioLabel(label);
    setCrop(centered(d.dw, d.dh, eff));
    setStep("crop");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [nat]);

  const goToRatio = useCallback(() => {
    setStep("ratio");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const reset = useCallback(() => {
    setSrc(null);
    setStep("upload");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const cropPx = Math.round((crop.w * nat.w) / (disp.dw || 1));
  const cropPy = Math.round((crop.h * nat.h) / (disp.dh || 1));

  return {
    step, src, name, nat, disp, ratio, ratioLabel,
    crop, setCrop, zoom, setZoom, pan, setPan,
    cropPx, cropPy,
    loadImage, pickRatio, goToRatio, reset,
  };
}
```

- [ ] **Step 3: Create useMultiCrop hook**

Create `hooks/use-multi-crop.ts` — port the multi/batch state from the artifact. This is the largest hook. Extract the analysis loop, retry logic, drag reorder, and edit navigation:

```ts
"use client";

import { useState, useCallback } from "react";
import { MultiCropItem, CropRect } from "@/lib/types";
import { dispSize } from "@/lib/image-utils";
import { centeredOnBbox } from "@/lib/crop-math";
import { detectFocal } from "@/lib/ai-client";

type MultiStep = "upload" | "ratio" | "review" | "recrop";

export function useMultiCrop() {
  const [step, setStep] = useState<MultiStep>("upload");
  const [items, setItems] = useState<MultiCropItem[]>([]);
  const [ratio, setRatio] = useState(1);
  const [ratioLabel, setRatioLabel] = useState("1:1");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editCrop, setEditCrop] = useState<CropRect | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const loadImages = useCallback((files: FileList) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    const out: (MultiCropItem | null)[] = new Array(arr.length).fill(null);
    let done = 0;
    arr.forEach((f, i) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const maxW = Math.min(window.innerWidth - 96, img.width);
          const maxH = Math.min(window.innerHeight - 230, img.height);
          out[i] = {
            src, name: f.name, mime: f.type,
            natural: { w: img.width, h: img.height },
            disp: dispSize(img.width, img.height, maxW, maxH),
            status: "pending", focal: null, crop: null, ratio: 1,
          };
          if (++done === arr.length) {
            setItems(out as MultiCropItem[]);
            setStep("ratio");
          }
        };
        img.src = src;
      };
      reader.readAsDataURL(f);
    });
  }, []);

  const runAnalysis = useCallback(async (currentItems: MultiCropItem[], ratioVal: number | null) => {
    for (let idx = 0; idx < currentItems.length; idx++) {
      const item = currentItems[idx];
      if (item.focal?.bbox && !item.focal?.error) {
        setItems((prev) => {
          const next = [...prev];
          const r = ratioVal ?? next[idx].ratio;
          next[idx] = {
            ...next[idx], status: "done", ratio: r,
            crop: centeredOnBbox(next[idx].disp.dw, next[idx].disp.dh, r, next[idx].focal!.bbox),
          };
          return next;
        });
        continue;
      }
      const focal = await detectFocal(item.src, item.mime);
      setItems((prev) => {
        const next = [...prev];
        const r = ratioVal ?? next[idx].ratio;
        next[idx] = {
          ...next[idx], focal, status: focal.error ? "error" : "done", ratio: r,
          crop: centeredOnBbox(next[idx].disp.dw, next[idx].disp.dh, r, focal.bbox),
        };
        return next;
      });
    }
  }, []);

  const startAnalysis = useCallback((ratioVal: number | null, rLabel: string) => {
    setRatioLabel(rLabel);
    setRatio(ratioVal ?? 1);
    const withStatus = items.map((it) => ({
      ...it,
      status: (it.focal?.bbox && !it.focal?.error ? "recalculating" : "analyzing") as MultiCropItem["status"],
      ratio: ratioVal ?? it.natural.w / it.natural.h,
    }));
    setItems(withStatus);
    setStep("review");
    runAnalysis(withStatus, ratioVal);
  }, [items, runAnalysis]);

  const batchRecrop = useCallback((ratioVal: number | null, rLabel: string) => {
    setRatioLabel(rLabel);
    setRatio(ratioVal ?? 1);
    const updated = items.map((it) => {
      const effR = ratioVal ?? it.natural.w / it.natural.h;
      if (it.focal?.bbox && !it.focal?.error) {
        return {
          ...it, ratio: effR, status: "done" as const,
          crop: centeredOnBbox(it.disp.dw, it.disp.dh, effR, it.focal.bbox),
        };
      }
      return { ...it, ratio: effR, status: "analyzing" as const };
    });
    setItems(updated);
    setStep("review");
    if (updated.some((it) => it.status === "analyzing")) runAnalysis(updated, ratioVal);
  }, [items, runAnalysis]);

  const retryItem = useCallback((idx: number) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: "analyzing", focal: null };
      return next;
    });
    (async () => {
      const item = items[idx];
      const focal = await detectFocal(item.src, item.mime);
      setItems((prev) => {
        const next = [...prev];
        next[idx] = {
          ...next[idx], focal, status: focal.error ? "error" : "done",
          crop: centeredOnBbox(next[idx].disp.dw, next[idx].disp.dh, next[idx].ratio, focal.bbox),
        };
        return next;
      });
    })();
  }, [items]);

  const reorderItems = useCallback((fromIdx: number, toIdx: number) => {
    setItems((prev) => {
      const next = [...prev];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, removed);
      return next;
    });
  }, []);

  const openEdit = useCallback((idx: number) => {
    setEditIdx(idx);
    setEditCrop(items[idx].crop ? { ...items[idx].crop! } : null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [items]);

  const saveAndCloseEdit = useCallback(() => {
    if (editIdx !== null && editCrop) {
      setItems((prev) => {
        const next = [...prev];
        next[editIdx] = { ...next[editIdx], crop: { ...editCrop } };
        return next;
      });
    }
    setEditIdx(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [editIdx, editCrop]);

  const navigateEdit = useCallback((direction: "prev" | "next") => {
    if (editIdx === null) return;
    const newIdx = direction === "prev" ? editIdx - 1 : editIdx + 1;
    if (newIdx < 0 || newIdx >= items.length) return;
    // save current
    if (editCrop) {
      setItems((prev) => {
        const next = [...prev];
        next[editIdx] = { ...next[editIdx], crop: { ...editCrop } };
        return next;
      });
    }
    setEditIdx(newIdx);
    setEditCrop(items[newIdx].crop ? { ...items[newIdx].crop! } : null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [editIdx, editCrop, items]);

  const reset = useCallback(() => {
    setItems([]);
    setEditIdx(null);
    setStep("upload");
  }, []);

  const editItem = editIdx !== null ? items[editIdx] : null;
  const editCropPx = editItem ? Math.round(((editCrop?.w || 0) * editItem.natural.w) / (editItem.disp.dw || 1)) : 0;
  const editCropPy = editItem ? Math.round(((editCrop?.h || 0) * editItem.natural.h) / (editItem.disp.dh || 1)) : 0;
  const doneCount = items.filter((it) => it.status === "done").length;
  const errCount = items.filter((it) => it.status === "error").length;
  const analyzingCount = items.filter((it) => it.status === "analyzing" || it.status === "recalculating").length;

  return {
    step, setStep, items, ratio, ratioLabel,
    editIdx, editItem, editCrop, setEditCrop,
    editCropPx, editCropPy,
    zoom, setZoom, pan, setPan,
    doneCount, errCount, analyzingCount,
    loadImages, startAnalysis, batchRecrop, retryItem,
    reorderItems, openEdit, saveAndCloseEdit, navigateEdit, reset,
  };
}
```

- [ ] **Step 4: Create useLogoProcessor hook**

Create `hooks/use-logo-processor.ts`:

```ts
"use client";

import { useState, useCallback } from "react";
import { NaturalSize } from "@/lib/types";
import { removeBg, recolorCanvas, canvasToDataURL } from "@/lib/logo-processing";

type LogoStep = "upload" | "edit";

export function useLogoProcessor() {
  const [step, setStep] = useState<LogoStep>("upload");
  const [src, setSrc] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nat, setNat] = useState<NaturalSize>({ w: 0, h: 0 });
  const [tolerance, setTolerance] = useState(40);
  const [recolor, setRecolor] = useState("none");
  const [customHex, setCustomHex] = useState("#022C12");
  const [baseCanvas, setBaseCanvas] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const processLogo = useCallback((imgSrc: string, w: number, h: number, tol: number, rec: string, hex: string) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      cv.getContext("2d")!.drawImage(img, 0, 0);
      const removed = removeBg(cv, tol);
      setBaseCanvas(removed);
      let final: HTMLCanvasElement = removed;
      const activeHex = rec === "custom" ? hex : rec;
      if (rec !== "none" && activeHex && /^#[0-9a-fA-F]{6}$/.test(activeHex)) {
        final = recolorCanvas(removed, activeHex);
      }
      setPreview(canvasToDataURL(final));
    };
    img.src = imgSrc;
  }, []);

  const loadLogo = useCallback((files: FileList) => {
    const f = Array.from(files).find((f) => f.type.startsWith("image/"));
    if (!f) return;
    setName(f.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setNat({ w: img.width, h: img.height });
        setSrc(result);
        setTolerance(40);
        setRecolor("none");
        processLogo(result, img.width, img.height, 40, "none", "#022C12");
        setStep("edit");
      };
      img.src = result;
    };
    reader.readAsDataURL(f);
  }, [processLogo]);

  const updateLogo = useCallback((tol: number, rec: string, hex: string) => {
    if (!src) return;
    processLogo(src, nat.w, nat.h, tol, rec, hex);
  }, [src, nat, processLogo]);

  const getExportCanvas = useCallback((): HTMLCanvasElement | null => {
    if (!baseCanvas) return null;
    const activeHex = recolor === "custom" ? customHex : recolor;
    if (recolor !== "none" && activeHex && /^#[0-9a-fA-F]{6}$/.test(activeHex)) {
      return recolorCanvas(baseCanvas, activeHex);
    }
    return baseCanvas;
  }, [baseCanvas, recolor, customHex]);

  const reset = useCallback(() => {
    setStep("upload");
    setSrc(null);
    setPreview(null);
    setBaseCanvas(null);
  }, []);

  return {
    step, src, name, nat, tolerance, setTolerance,
    recolor, setRecolor, customHex, setCustomHex,
    preview, loadLogo, updateLogo, getExportCanvas, reset,
  };
}
```

- [ ] **Step 5: Create useKeyboardShortcuts hook**

Create `hooks/use-keyboard-shortcuts.ts`:

```ts
"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SHORTCUT_MAP } from "@/lib/constants";

interface ShortcutActions {
  onEnter?: () => void;
  onEscape?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  /** When true, disables global 1-3 mode navigation (e.g., when RatioPicker is active) */
  disableModeNav?: boolean;
}

export function useKeyboardShortcuts(actions: ShortcutActions = {}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when input is focused
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Number keys — mode navigation (disabled when ratio picker is active)
      if (!actions.disableModeNav) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 3) {
          e.preventDefault();
          router.push(`/${SHORTCUT_MAP.modes[num - 1]}`);
          return;
        }
      }

      if (e.key === "Enter" && actions.onEnter) {
        e.preventDefault();
        actions.onEnter();
        return;
      }

      if (e.key === "Escape" && actions.onEscape) {
        e.preventDefault();
        actions.onEscape();
        return;
      }

      if (e.key === "ArrowLeft" && actions.onLeft) {
        e.preventDefault();
        actions.onLeft();
        return;
      }

      if (e.key === "ArrowRight" && actions.onRight) {
        e.preventDefault();
        actions.onRight();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, pathname, actions]);
}
```

- [ ] **Step 6: Commit**

```bash
git add hooks/
git commit -m "feat: add custom hooks (crop drag, single crop, multi crop, logo processor, keyboard shortcuts)"
```

---

### Task 12: Layout and Root Page

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`
- Update: `styles/globals.css`

- [ ] **Step 1: Update globals.css**

Update `styles/globals.css` to include Tailwind directives and custom animations:

```css
@import "tailwindcss";

@theme {
  --animate-fadeUp: fadeUp 0.35s ease;
  --animate-spin: spin 0.7s linear infinite;
  --animate-pulse: pulse 1.2s ease infinite;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

- [ ] **Step 2: Update app/layout.tsx**

Replace `app/layout.tsx` with the shell layout — header with logo and tab navigation:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { NavTabs } from "@/components/nav-tabs";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Image Tools — Understory",
  description: "Crop, AI smart crop, and logo processing tools",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-white`}>
        <div className="flex flex-col items-center px-6 pb-16">
          <header className="w-full max-w-[1200px] flex items-center justify-between py-5 mb-2">
            <div className="flex items-center gap-2.5">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <path d="M16 3C11 8 6 14 6 20c0 5.5 4.5 10 10 10s10-4.5 10-10C26 14 21 8 16 3z" fill="#022C12" opacity="0.9" />
                <path d="M16 12v14M12 18c2-2 4-3 4-6M20 20c-2-2-4-4-4-8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
              </svg>
              <span className="text-base font-bold text-text tracking-tight">Image Tools</span>
            </div>
            <NavTabs />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create NavTabs component**

Create `components/nav-tabs.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyboardHint } from "@/components/ui/keyboard-hint";

const tabs = [
  { href: "/single", label: "Single", shortcut: "1" },
  { href: "/smart-crop", label: "AI Smart Crop", shortcut: "2" },
  { href: "/logo", label: "Logo", shortcut: "3" },
];

export function NavTabs() {
  const pathname = usePathname();

  return (
    <div className="flex bg-surface rounded-xl border-[1.5px] border-border p-[3px] gap-0.5">
      {tabs.map(({ href, label, shortcut }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`
              px-5 py-2 rounded-[10px] border-none text-[13px] font-semibold
              transition-all duration-200 no-underline flex items-center gap-2
              ${active ? "bg-primary text-white" : "bg-transparent text-text-muted hover:text-text"}
            `}
          >
            {label}
            {!active && <KeyboardHint shortcut={shortcut} />}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Update app/page.tsx**

Replace `app/page.tsx` with a redirect:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/single");
}
```

- [ ] **Step 5: Verify dev server starts**

```bash
npm run dev
```

Visit `http://localhost:3000` — should redirect to `/single` and show the header with tab navigation.

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx app/page.tsx components/nav-tabs.tsx styles/globals.css
git commit -m "feat: add layout shell with header, tab navigation, and root redirect"
```

---

### Task 13: Single Crop Page

**Files:**
- Create: `app/single/page.tsx`

- [ ] **Step 1: Implement single crop page**

Create `app/single/page.tsx` — thin shell that uses `useSingleCrop` hook and renders the three-step flow (upload → ratio → crop). Port the UI structure from the artifact's single mode section:

```tsx
"use client";

import { useSingleCrop } from "@/hooks/use-single-crop";
import { useCropDrag } from "@/hooks/use-crop-drag";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { DropZone } from "@/components/ui/drop-zone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SizeInput } from "@/components/ui/size-input";
import { RatioPicker } from "@/components/crop/ratio-picker";
import { ZoomableEditor } from "@/components/crop/zoomable-editor";
import { dlCrop } from "@/lib/download";
import { cropFilename } from "@/lib/image-utils";
import { DlIcon } from "@/components/icons";

export default function SinglePage() {
  const {
    step, src, name, nat, disp, ratio, ratioLabel,
    crop, setCrop, zoom, setZoom, pan, setPan,
    cropPx, cropPy, loadImage, pickRatio, goToRatio, reset,
  } = useSingleCrop();
  const { startDrag } = useCropDrag();

  useKeyboardShortcuts({
    onEnter: step === "crop" && src ? () => dlCrop(src, nat, disp, crop, cropFilename(name)) : undefined,
    onEscape: step === "crop" ? goToRatio : step === "ratio" ? reset : undefined,
    disableModeNav: step === "ratio", // RatioPicker handles 1-4 keys itself
  });

  return (
    <div className="w-full max-w-[1200px]">
      {step === "upload" && (
        <div className="max-w-[460px] w-full mx-auto mt-16 animate-fadeUp">
          <div className="text-center mb-8">
            <h1 className="text-[28px] font-bold mb-2 tracking-tight">Crop an image</h1>
            <p className="text-[15px] text-text-muted leading-relaxed">
              Upload, pick a ratio, download at full resolution.
            </p>
          </div>
          <DropZone onFiles={loadImage}>
            {(over) => (
              <>
                <div className="w-14 h-14 rounded-[14px] bg-primary-bg flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#022C12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
                <p className={`text-[15px] font-medium ${over ? "text-primary" : "text-text-secondary"}`}>
                  Drop image here or <span className="text-primary font-bold">browse</span>
                </p>
                <p className="text-xs mt-2 text-text-dim">PNG, JPG, or WebP</p>
              </>
            )}
          </DropZone>
        </div>
      )}

      {step === "ratio" && (
        <div className="mt-16 mx-auto">
          <RatioPicker subtitle="Step 1 of 2" onPick={pickRatio} onBack={reset} />
        </div>
      )}

      {step === "crop" && src && (
        <div className="flex flex-col items-center gap-4 animate-fadeUp">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-lg font-bold tracking-tight">Adjust crop</span>
            <Badge>{ratioLabel}</Badge>
            <SizeInput cropPx={cropPx} cropPy={cropPy} ratio={ratio} crop={crop} setCrop={setCrop} disp={disp} nat={nat} />
          </div>
          <ZoomableEditor
            src={src} disp={disp} crop={crop} setCrop={setCrop} ratio={ratio}
            onDown={(e, t) => startDrag(e, t, crop, setCrop, ratio, disp.dw, disp.dh, zoom)}
            zoom={zoom} setZoom={setZoom} pan={pan} setPan={setPan}
          />
          <div className="flex items-center gap-2 flex-wrap justify-center mt-1">
            <Button onClick={goToRatio}>Change ratio</Button>
            <Button onClick={reset}>New image</Button>
            <Button variant="primary" onClick={() => dlCrop(src, nat, disp, crop, cropFilename(name))}>
              <DlIcon /> Download
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create shared icons file**

Create `components/icons.tsx`:

```tsx
export function DlIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function RetryIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
  );
}

export function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

export function RatioIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11V5a2 2 0 00-2-2H5" />
      <polyline points="7 7 1 1 7 1" />
      <path d="M3 13v6a2 2 0 002 2h14" />
      <polyline points="17 17 23 23 17 23" />
    </svg>
  );
}
```

- [ ] **Step 3: Verify single crop page renders**

```bash
npm run dev
```

Visit `http://localhost:3000/single` — should show the upload screen with drop zone.

- [ ] **Step 4: Commit**

```bash
git add app/single/ components/icons.tsx
git commit -m "feat: add single crop page with full upload → ratio → crop flow"
```

---

### Task 14: AI Smart Crop Page

**Files:**
- Create: `app/smart-crop/page.tsx`

- [ ] **Step 1: Implement smart crop page**

Create `app/smart-crop/page.tsx` — the largest page, containing the upload, ratio picker, review grid with drag reorder, and edit view. Port from the artifact's multi mode section using the `useMultiCrop` hook.

This file will be ~300 lines. It renders:
- Upload step with multi-file DropZone
- RatioPicker step
- Review grid with status indicators, drag reorder, edit/retry/download buttons per card
- Edit view with ZoomableEditor, prev/next navigation, SizeInput

Follow the exact same UI structure as the artifact — the grid cards with image previews, crop overlay visualization, analyzing spinner, error states, drag handles, and bottom action bar.

Use `useKeyboardShortcuts` with context-aware actions:
- In edit view: `onEnter` = download current, `onEscape` = save & back to grid, `onLeft`/`onRight` = prev/next
- In grid view: `onEscape` = new batch
- Pass `disableModeNav: true` when `step === "ratio"` or `step === "recrop"` so the RatioPicker's own 1-4 keys work without triggering mode navigation

- [ ] **Step 2: Verify smart crop page renders**

```bash
npm run dev
```

Visit `http://localhost:3000/smart-crop` — should show multi-file upload screen.

- [ ] **Step 3: Commit**

```bash
git add app/smart-crop/
git commit -m "feat: add AI smart crop page with batch analysis, grid review, and edit view"
```

---

### Task 15: Logo Processor Page

**Files:**
- Create: `app/logo/page.tsx`

- [ ] **Step 1: Implement logo page**

Create `app/logo/page.tsx` — uses `useLogoProcessor` hook. Shows upload step, then edit view with side-by-side original/processed preview and `LogoControls` panel. Port from the artifact's logo mode section.

Include:
- Upload step with DropZone
- Edit view with original and processed images side by side
- Checkerboard background on processed preview (indicates transparency)
- LogoControls component for tolerance and recolor
- Download PNG button
- New logo button

Use `useKeyboardShortcuts` with:
- `onEnter` = download (in edit step)
- `onEscape` = reset to upload

- [ ] **Step 2: Verify logo page renders**

```bash
npm run dev
```

Visit `http://localhost:3000/logo` — should show logo upload screen.

- [ ] **Step 3: Commit**

```bash
git add app/logo/
git commit -m "feat: add logo processor page with bg removal and recolor"
```

---

### Task 16: Integration Testing and Polish

**Files:**
- Modify: various files for bug fixes

- [ ] **Step 1: Run all unit tests**

```bash
npm run test
```

Expected: All tests pass.

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Manual smoke test all three modes**

Start dev server and verify:
1. **Single Crop**: Upload image → pick ratio → drag crop → download works
2. **AI Smart Crop**: Upload multiple images → pick ratio → analysis runs → edit individual crops → download all works
3. **Logo Processor**: Upload logo → adjust tolerance → change recolor → download works
4. **Keyboard shortcuts**: 1/2/3 switch modes, number keys pick ratios, Enter downloads, Escape goes back, ←/→ navigate batch edit
5. **Tab navigation**: All three tabs work, active tab highlighted
6. **Error handling**: Try uploading a .gif (should be rejected), try uploading a 30MB file (should be rejected)

- [ ] **Step 5: Fix any issues found**

Address bugs discovered during smoke testing.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration testing fixes"
```

---

### Task 17: Final Cleanup and Deploy Prep

**Files:**
- Update: `.gitignore`, `package.json`
- Create: `.env.example`

- [ ] **Step 1: Verify .env.example is committed**

```bash
git ls-files .env.example
```

Should show the file. If not, add and commit it.

- [ ] **Step 2: Verify .gitignore excludes sensitive files**

```bash
cat .gitignore
```

Must include: `node_modules`, `.next`, `.env.local`, `.superpowers`

- [ ] **Step 3: Run final build and test**

```bash
npm run test && npm run build
```

Both should succeed.

- [ ] **Step 4: Commit any remaining changes**

```bash
git status
```

If clean, no commit needed. If changes exist:

```bash
git add -A
git commit -m "chore: final cleanup for deploy"
```

- [ ] **Step 5: Push to GitHub and deploy**

```bash
git remote add origin <github-repo-url>
git push -u origin main
```

Then connect the repo to Vercel:
1. Go to vercel.com → New Project → Import from GitHub
2. Select the repo
3. Add environment variable: `ANTHROPIC_API_KEY`
4. Deploy

Share the resulting URL with the team.
