# Image Tools v2 Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 improvements to reduce crop workflow friction, support batch manual crops, and fix logo background removal quality.

**Architecture:** All changes follow the existing pattern: pages are thin shells, hooks own state, pure functions in `lib/`. New features add new hooks/components without changing the core architecture. Route rename from `/single` to `/crop` is a prerequisite that all other tasks build on.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-22-image-tools-v2-design.md`

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `app/crop/page.tsx` | Replaces `app/single/page.tsx` — Crop mode with batch support |
| `hooks/use-clipboard-paste.ts` | Global paste event listener, extracts images from clipboard |
| `components/crop/crop-preview.tsx` | Live canvas preview of cropped result |
| `components/crop/image-filmstrip.tsx` | Horizontal thumbnail bar for batch queue navigation |
| `components/crop/ratio-drop-zones.tsx` | 2×2 grid of ratio-specific drop targets for upload |

### Modified files

| File | Changes |
|------|---------|
| `lib/constants.ts` | Add `STORAGE_KEYS`, update `SHORTCUT_MAP.modes` to use `"crop"` |
| `lib/types.ts` | Add `CropQueueItem` interface |
| `lib/logo-processing.ts` | Add `hasTransparency`, rewrite `removeBg` with two-pass + edge check |
| `lib/download.ts` | Add `dlAllCropQueue` for batch crop downloads |
| `hooks/use-single-crop.ts` | Refactor to support image queue with per-image crop state |
| `hooks/use-logo-processor.ts` | Add transparency detection, remove tolerance state |
| `hooks/use-keyboard-shortcuts.ts` | Update mode routes |
| `components/nav-tabs.tsx` | Rename labels and routes |
| `components/crop/ratio-picker.tsx` | Add localStorage persistence, pre-highlight, Enter-to-confirm |
| `components/logo/logo-controls.tsx` | Replace slider with toggle, add transparency info |
| `components/ui/drop-zone.tsx` | Add paste hint text |
| `app/page.tsx` | Update redirect `/single` → `/crop` |
| `app/smart-crop/page.tsx` | Add crop preview in edit view, wire clipboard paste |
| `app/logo/page.tsx` | Update for simplified logo controls |
| `__tests__/logo-processing.test.ts` | Add `hasTransparency` tests, update `removeBg` tests |

### Deleted files

| File | Reason |
|------|--------|
| `app/single/page.tsx` | Replaced by `app/crop/page.tsx` |

---

### Task 1: Route Rename — `/single` → `/crop`

**Files:**
- Create: `app/crop/page.tsx` (copy of `app/single/page.tsx`)
- Delete: `app/single/page.tsx`
- Modify: `components/nav-tabs.tsx`, `lib/constants.ts`, `hooks/use-keyboard-shortcuts.ts`, `app/page.tsx`

- [ ] **Step 1: Create `app/crop/` directory and copy the page**

```bash
mkdir -p app/crop
cp app/single/page.tsx app/crop/page.tsx
```

- [ ] **Step 2: Delete old route**

```bash
rm -rf app/single
```

- [ ] **Step 3: Update nav tabs**

In `components/nav-tabs.tsx`, change the tabs array:

```tsx
const tabs = [
  { href: "/crop", label: "Crop", shortcut: "1" },
  { href: "/smart-crop", label: "Smart Crop", shortcut: "2" },
  { href: "/logo", label: "Logo", shortcut: "3" },
];
```

- [ ] **Step 4: Update SHORTCUT_MAP in constants**

In `lib/constants.ts`, change:

```ts
export const SHORTCUT_MAP = {
  modes: ["crop", "smart-crop", "logo"] as const,
  ratios: [0, 1, 2, 3] as const,
};
```

- [ ] **Step 5: Update root redirect**

In `app/page.tsx`, change:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/crop");
}
```

- [ ] **Step 6: Update page title in `app/crop/page.tsx`**

Change the heading from "Crop an image" to "Crop" (if desired — or keep as is). Update the import path if needed. The page component stays the same since it uses hooks that don't reference the route.

- [ ] **Step 7: Verify**

```bash
npm run build
npm run test
```

Visit `http://localhost:3000` — should redirect to `/crop`. All three tabs should work with updated labels.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: rename /single to /crop, update nav labels"
```

---

### Task 2: Remember Last Ratio

**Files:**
- Modify: `lib/constants.ts`, `components/crop/ratio-picker.tsx`

- [ ] **Step 1: Add STORAGE_KEYS to constants**

In `lib/constants.ts`, add:

```ts
export const STORAGE_KEYS = {
  lastRatio: "image-tools:last-ratio",
} as const;
```

- [ ] **Step 2: Update RatioPicker with localStorage persistence**

In `components/crop/ratio-picker.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { RATIOS, STORAGE_KEYS } from "@/lib/constants";
import { KeyboardHint } from "@/components/ui/keyboard-hint";

interface RatioPickerProps {
  onPick: (value: number | null, label: string) => void;
  onBack: () => void;
  subtitle?: string;
  backLabel?: string;
}

export function RatioPicker({ onPick, onBack, subtitle, backLabel = "← Go back" }: RatioPickerProps) {
  const [hov, setHov] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string>("Square");

  // Load last ratio from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.lastRatio);
      if (saved && RATIOS.some((r) => r.label === saved)) {
        setHighlighted(saved);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const handlePick = useCallback((value: number | null, label: string) => {
    try {
      localStorage.setItem(STORAGE_KEYS.lastRatio, label);
    } catch {
      // localStorage unavailable
    }
    onPick(value, label);
  }, [onPick]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < RATIOS.length) {
        e.preventDefault();
        handlePick(RATIOS[idx].value, RATIOS[idx].label);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const ratio = RATIOS.find((r) => r.label === highlighted);
        if (ratio) handlePick(ratio.value, ratio.label);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlePick, onBack, highlighted]);

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
        {RATIOS.map(({ label, sub, value }, idx) => {
          const isHighlighted = label === highlighted;
          const isHovered = hov === label;
          return (
            <button
              key={label}
              onClick={() => handlePick(value, label)}
              onMouseEnter={() => setHov(label)}
              onMouseLeave={() => setHov(null)}
              className={`
                py-3.5 rounded-xl border-[1.5px] cursor-pointer transition-all duration-150
                flex flex-col items-center gap-1 relative
                ${isHovered || isHighlighted
                  ? "border-primary bg-primary-bg"
                  : "border-border bg-white"
                }
              `}
            >
              <span className={`text-[15px] font-bold ${isHovered || isHighlighted ? "text-primary" : "text-text"}`}>
                {label}
              </span>
              <span className={`text-[11px] font-medium ${isHovered || isHighlighted ? "text-primary-muted" : "text-text-muted"}`}>
                {sub}
              </span>
              <span className="absolute top-2 right-2">
                <KeyboardHint shortcut={String(idx + 1)} />
              </span>
            </button>
          );
        })}
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

- [ ] **Step 3: Verify**

```bash
npm run build
```

Open ratio picker, select "Cover image", refresh the page, open ratio picker again — "Cover image" should be pre-highlighted.

- [ ] **Step 4: Commit**

```bash
git add lib/constants.ts components/crop/ratio-picker.tsx
git commit -m "feat: remember last selected ratio in localStorage"
```

---

### Task 3: Clipboard Paste

**Files:**
- Create: `hooks/use-clipboard-paste.ts`
- Modify: `components/ui/drop-zone.tsx`, `app/crop/page.tsx`, `app/smart-crop/page.tsx`, `app/logo/page.tsx`

- [ ] **Step 1: Create the clipboard paste hook**

Create `hooks/use-clipboard-paste.ts`:

```ts
"use client";

import { useEffect } from "react";
import { ACCEPTED_TYPES, MAX_FILE_SIZE } from "@/lib/constants";

export function useClipboardPaste(onFiles: ((files: FileList) => void) | null) {
  useEffect(() => {
    if (!onFiles) return;

    const handler = (e: ClipboardEvent) => {
      // Skip when input is focused
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file && ACCEPTED_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        // Convert to FileList-like object
        const dt = new DataTransfer();
        imageFiles.forEach((f) => dt.items.add(f));
        onFiles(dt.files);
      }
    };

    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [onFiles]);
}
```

- [ ] **Step 2: Update DropZone with paste hint**

In `components/ui/drop-zone.tsx`, add a platform-aware paste hint. Add this helper at the top of the file:

```tsx
function getPasteShortcut(): string {
  if (typeof navigator !== "undefined" && navigator.platform?.toLowerCase().includes("mac")) {
    return "Cmd+V";
  }
  return "Ctrl+V";
}
```

Then add an optional `showPasteHint` prop (default `true`) and render the hint below the children:

The children render function signature stays the same — the paste hint is rendered by the DropZone itself, not by the children. Add after the `{children(over)}` line inside the drop area:

```tsx
<div className="text-[10px] text-text-dim mt-2">
  or paste with {getPasteShortcut()}
</div>
```

- [ ] **Step 3: Wire clipboard paste into each page**

In `app/crop/page.tsx`, add:
```tsx
import { useClipboardPaste } from "@/hooks/use-clipboard-paste";
// Inside component:
useClipboardPaste(step === "upload" ? loadImage : null);
```

In `app/smart-crop/page.tsx`, add:
```tsx
import { useClipboardPaste } from "@/hooks/use-clipboard-paste";
// Inside component:
useClipboardPaste(step === "upload" ? loadImages : null);
```

In `app/logo/page.tsx`, add:
```tsx
import { useClipboardPaste } from "@/hooks/use-clipboard-paste";
// Inside component:
useClipboardPaste(step === "upload" ? loadLogo : null);
```

- [ ] **Step 4: Verify**

```bash
npm run build
```

Copy an image to clipboard, navigate to `/crop`, press Cmd/Ctrl+V — should load the image.

- [ ] **Step 5: Commit**

```bash
git add hooks/use-clipboard-paste.ts components/ui/drop-zone.tsx app/crop/page.tsx app/smart-crop/page.tsx app/logo/page.tsx
git commit -m "feat: add clipboard paste support (Cmd/Ctrl+V) on all modes"
```

---

### Task 4: Types and Download Util for Batch Crop

**Files:**
- Modify: `lib/types.ts`, `lib/download.ts`

- [ ] **Step 1: Add CropQueueItem type**

In `lib/types.ts`, add:

```ts
export interface CropQueueItem {
  src: string;
  name: string;
  natural: NaturalSize;
  disp: DisplaySize;
  crop: CropRect;
  adjusted: boolean; // true if user manually moved the crop
}
```

- [ ] **Step 2: Add batch download for crop queue**

In `lib/download.ts`, add:

```ts
import { CropQueueItem } from "./types";

export async function dlAllCropQueue(items: CropQueueItem[]): Promise<void> {
  if (!items.length) return;

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  await Promise.all(
    items.map(async (it) => {
      try {
        const blob = await cropToBlob(it.src, it.natural, it.disp, it.crop);
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
```

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts lib/download.ts
git commit -m "feat: add CropQueueItem type and batch crop download"
```

---

### Task 5: Refactor useSingleCrop to Support Image Queue

**Files:**
- Modify: `hooks/use-single-crop.ts`

This is the biggest hook refactor. The hook must support both single and multi-image workflows.

- [ ] **Step 1: Rewrite useSingleCrop**

Replace `hooks/use-single-crop.ts` with a version that manages an array of `CropQueueItem`s and a current index:

```ts
"use client";

import { useState, useCallback } from "react";
import { CropRect, NaturalSize, DisplaySize, CropQueueItem } from "@/lib/types";
import { dispSize } from "@/lib/image-utils";
import { centered } from "@/lib/crop-math";

type CropStep = "upload" | "ratio" | "crop";

interface LoadedImage {
  src: string;
  name: string;
  nat: NaturalSize;
}

function computeDisp(nat: NaturalSize): DisplaySize {
  return dispSize(
    nat.w,
    nat.h,
    Math.min(typeof window !== "undefined" ? window.innerWidth - 96 : 800, nat.w),
    Math.min(typeof window !== "undefined" ? window.innerHeight - 230 : 600, nat.h),
  );
}

export function useSingleCrop() {
  const [step, setStep] = useState<CropStep>("upload");
  const [queue, setQueue] = useState<CropQueueItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [pendingImages, setPendingImages] = useState<LoadedImage[]>([]);
  const [ratio, setRatio] = useState(1);
  const [ratioLabel, setRatioLabel] = useState("1:1");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const current = queue[currentIdx] || null;

  const loadImage = useCallback((files: FileList) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;

    const loaded: LoadedImage[] = [];
    let done = 0;
    arr.forEach((f, i) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          loaded[i] = { src: result, name: f.name, nat: { w: img.width, h: img.height } };
          if (++done === arr.length) {
            setPendingImages(loaded);
            setStep("ratio");
          }
        };
        img.src = result;
      };
      reader.readAsDataURL(f);
    });
  }, []);

  const loadWithRatio = useCallback((files: FileList, ratioVal: number | null, rLabel: string) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;

    const items: CropQueueItem[] = [];
    let done = 0;
    arr.forEach((f, i) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const nat = { w: img.width, h: img.height };
          const d = computeDisp(nat);
          const eff = ratioVal ?? nat.w / nat.h;
          items[i] = {
            src: result,
            name: f.name,
            natural: nat,
            disp: d,
            crop: centered(d.dw, d.dh, eff),
            adjusted: false,
          };
          if (++done === arr.length) {
            setQueue(items);
            setCurrentIdx(0);
            setRatio(eff);
            setRatioLabel(rLabel);
            setStep("crop");
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }
        };
        img.src = result;
      };
      reader.readAsDataURL(f);
    });
  }, []);

  const pickRatio = useCallback((v: number | null, label: string) => {
    const eff = v ?? (pendingImages[0]?.nat.w || 1) / (pendingImages[0]?.nat.h || 1);
    const items: CropQueueItem[] = pendingImages.map((img) => {
      const d = computeDisp(img.nat);
      return {
        src: img.src,
        name: img.name,
        natural: img.nat,
        disp: d,
        crop: centered(d.dw, d.dh, eff),
        adjusted: false,
      };
    });
    setQueue(items);
    setCurrentIdx(0);
    setRatio(eff);
    setRatioLabel(label);
    setStep("crop");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [pendingImages]);

  const setCrop = useCallback((crop: CropRect) => {
    setQueue((prev) => {
      const next = [...prev];
      if (next[currentIdx]) {
        next[currentIdx] = { ...next[currentIdx], crop, adjusted: true };
      }
      return next;
    });
  }, [currentIdx]);

  const navigateTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= queue.length) return;
    setCurrentIdx(idx);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [queue.length]);

  const goToRatio = useCallback(() => {
    setStep("ratio");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const reset = useCallback(() => {
    setQueue([]);
    setPendingImages([]);
    setCurrentIdx(0);
    setStep("upload");
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const cropPx = current ? Math.round((current.crop.w * current.natural.w) / (current.disp.dw || 1)) : 0;
  const cropPy = current ? Math.round((current.crop.h * current.natural.h) / (current.disp.dh || 1)) : 0;
  const isMulti = queue.length > 1;

  return {
    step, queue, currentIdx, current, ratio, ratioLabel,
    crop: current?.crop ?? { x: 0, y: 0, w: 0, h: 0 },
    setCrop,
    src: current?.src ?? null,
    name: current?.name ?? "",
    nat: current?.natural ?? { w: 0, h: 0 },
    disp: current?.disp ?? { dw: 0, dh: 0 },
    zoom, setZoom, pan, setPan,
    cropPx, cropPy, isMulti,
    loadImage, loadWithRatio, pickRatio, navigateTo, goToRatio, reset,
  };
}
```

- [ ] **Step 2: Verify existing functionality still works**

```bash
npm run build
```

Upload a single image on `/crop` — the flow should work identically to before.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-single-crop.ts
git commit -m "feat: refactor useSingleCrop to support image queue"
```

---

### Task 6: Ratio Drop Zones + Batch Upload UI

**Files:**
- Create: `components/crop/ratio-drop-zones.tsx`, `components/crop/image-filmstrip.tsx`
- Modify: `app/crop/page.tsx`

- [ ] **Step 1: Create RatioDropZones component**

Create `components/crop/ratio-drop-zones.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { RATIOS, ACCEPTED_TYPES, MAX_FILE_SIZE } from "@/lib/constants";

interface RatioDropZonesProps {
  onDropWithRatio: (files: FileList, ratioValue: number | null, ratioLabel: string) => void;
  onBrowse: (files: FileList) => void;
}

export function RatioDropZones({ onDropWithRatio, onBrowse }: RatioDropZonesProps) {
  const [overIdx, setOverIdx] = useState<number | null>(null);
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
      <div className="grid grid-cols-2 gap-3 max-w-[480px] mx-auto">
        {RATIOS.map(({ label, sub, value }, idx) => (
          <div
            key={label}
            onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
            onDragLeave={() => setOverIdx(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOverIdx(null);
              const valid = validate(e.dataTransfer.files);
              if (valid) onDropWithRatio(valid, value, label);
            }}
            className={`
              border-2 border-dashed rounded-2xl py-10 px-6 cursor-default
              text-center transition-all duration-200 flex flex-col items-center gap-2
              ${overIdx === idx ? "border-primary bg-primary-bg" : "border-border bg-surface"}
            `}
          >
            <span className={`text-[15px] font-bold ${overIdx === idx ? "text-primary" : "text-text"}`}>
              {label}
            </span>
            <span className={`text-[11px] font-medium ${overIdx === idx ? "text-primary-muted" : "text-text-muted"}`}>
              {sub}
            </span>
            <span className="text-[10px] text-text-dim mt-1">
              Drop image here
            </span>
          </div>
        ))}
      </div>
      <div className="text-center mt-6">
        <button
          onClick={() => inputRef.current?.click()}
          className="text-[13px] text-primary font-semibold cursor-pointer bg-transparent border-none hover:underline"
        >
          or browse files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              const valid = validate(e.target.files);
              if (valid) onBrowse(valid);
            }
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p className="mt-3 text-sm text-error font-medium text-center">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create ImageFilmstrip component**

Create `components/crop/image-filmstrip.tsx`:

```tsx
"use client";

import { CropQueueItem } from "@/lib/types";

interface ImageFilmstripProps {
  items: CropQueueItem[];
  currentIdx: number;
  onSelect: (idx: number) => void;
}

export function ImageFilmstrip({ items, currentIdx, onSelect }: ImageFilmstripProps) {
  if (items.length <= 1) return null;

  return (
    <div className="flex gap-2 overflow-x-auto py-2 px-1 max-w-full">
      {items.map((item, idx) => (
        <button
          key={idx}
          onClick={() => onSelect(idx)}
          className={`
            shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 cursor-pointer
            transition-all duration-150
            ${idx === currentIdx
              ? "border-primary shadow-md"
              : item.adjusted
                ? "border-primary-muted/50"
                : "border-border"
            }
          `}
        >
          <img
            src={item.src}
            className="w-full h-full object-cover"
            draggable={false}
          />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite Crop page**

Rewrite `app/crop/page.tsx` to use the new components. The page should:

- **Upload step:** Show `RatioDropZones` instead of a single DropZone. Title: "Crop". Subtitle: "Drop images onto a ratio to start, or browse to choose later."
- **Ratio step:** Show `RatioPicker` (unchanged from before, for the browse fallback flow)
- **Crop step:** Show `ZoomableEditor` + `CropPreview` side by side in a flex row. Below: `ImageFilmstrip` (if multi). Below that: action buttons. Add "Download all" button when `isMulti`. Wire `←`/`→` to `navigateTo(currentIdx - 1)` / `navigateTo(currentIdx + 1)`.

The page imports: `useSingleCrop`, `useCropDrag`, `useKeyboardShortcuts`, `useClipboardPaste`, `RatioDropZones`, `RatioPicker`, `ZoomableEditor`, `ImageFilmstrip`, `Button`, `Badge`, `SizeInput`, `DlIcon`, icons.

Use `useKeyboardShortcuts` with:
- `disableModeNav: step === "ratio"`
- `onEnter`: download current crop
- `onEscape`: go back (crop→ratio, ratio→upload)
- `onLeft` / `onRight`: navigate queue (only when `isMulti` and `step === "crop"`)

Wire `useClipboardPaste(step === "upload" ? loadImage : null)`.

- [ ] **Step 4: Verify**

```bash
npm run build
```

Test: Drop a single image onto "Square" → should go straight to crop editor. Drop multiple images → should show filmstrip. Browse → should go through ratio picker. Navigate with ←/→.

- [ ] **Step 5: Commit**

```bash
git add components/crop/ratio-drop-zones.tsx components/crop/image-filmstrip.tsx app/crop/page.tsx
git commit -m "feat: add ratio drop zones, batch queue, and filmstrip to Crop mode"
```

---

### Task 7: Live Crop Preview

**Files:**
- Create: `components/crop/crop-preview.tsx`
- Modify: `app/crop/page.tsx`, `app/smart-crop/page.tsx`

- [ ] **Step 1: Create CropPreview component**

Create `components/crop/crop-preview.tsx`:

```tsx
"use client";

import { useRef, useEffect } from "react";
import { CropRect, NaturalSize, DisplaySize } from "@/lib/types";

interface CropPreviewProps {
  src: string;
  nat: NaturalSize;
  disp: DisplaySize;
  crop: CropRect;
}

export function CropPreview({ src, nat, disp, crop }: CropPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Load image once
  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; };
    img.src = src;
  }, [src]);

  // Redraw on crop change
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !crop.w || !crop.h) return;

    const raf = requestAnimationFrame(() => {
      const sx = (crop.x / disp.dw) * nat.w;
      const sy = (crop.y / disp.dh) * nat.h;
      const sw = (crop.w / disp.dw) * nat.w;
      const sh = (crop.h / disp.dh) * nat.h;

      const previewW = 200;
      const previewH = (sh / sw) * previewW;

      canvas.width = previewW;
      canvas.height = previewH;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, previewW, previewH);
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [src, nat, disp, crop]);

  return (
    <div className="hidden lg:flex flex-col items-center gap-2 shrink-0">
      <span className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.1em]">
        Preview
      </span>
      <canvas
        ref={canvasRef}
        className="rounded-lg border border-border max-w-[200px]"
      />
    </div>
  );
}
```

- [ ] **Step 2: Add preview to Crop page**

In `app/crop/page.tsx`, in the crop step, wrap the `ZoomableEditor` and `CropPreview` in a flex row:

```tsx
<div className="flex items-start gap-6">
  <ZoomableEditor ... />
  {src && <CropPreview src={src} nat={nat} disp={disp} crop={crop} />}
</div>
```

- [ ] **Step 3: Add preview to Smart Crop edit view**

In `app/smart-crop/page.tsx`, in the edit view section, add the same flex wrapper around the `ZoomableEditor` and a `CropPreview`.

- [ ] **Step 4: Verify**

```bash
npm run build
```

Open crop editor — preview panel should appear on the right on wide screens, hidden on narrow screens. Move the crop — preview updates in real-time.

- [ ] **Step 5: Commit**

```bash
git add components/crop/crop-preview.tsx app/crop/page.tsx app/smart-crop/page.tsx
git commit -m "feat: add live crop preview panel"
```

---

### Task 8: Logo Processing — hasTransparency + Improved removeBg (TDD)

**Files:**
- Modify: `lib/logo-processing.ts`, `__tests__/logo-processing.test.ts`

- [ ] **Step 1: Write failing test for hasTransparency**

Add to `__tests__/logo-processing.test.ts`:

```ts
import { hasTransparency } from "@/lib/logo-processing";

describe("hasTransparency", () => {
  it("returns false for fully opaque canvas", () => {
    const cv = createTestCanvas(10, 10, "#ff0000");
    expect(hasTransparency(cv)).toBe(false);
  });

  it("returns true for canvas with transparent pixels", () => {
    const cv = createTestCanvas(10, 10, "#ff0000");
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, 5, 5);
    expect(hasTransparency(cv)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- __tests__/logo-processing.test.ts
```

Expected: FAIL — `hasTransparency` not exported.

- [ ] **Step 3: Implement hasTransparency**

Add to `lib/logo-processing.ts`:

```ts
export function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- __tests__/logo-processing.test.ts
```

- [ ] **Step 5: Update removeBg tests for enclosed area preservation**

Add to `__tests__/logo-processing.test.ts`:

```ts
describe("removeBg (improved)", () => {
  it("preserves enclosed areas that match background color", () => {
    // Create a 100x100 white canvas with a dark border rectangle (simulating a letter)
    // Inside the rectangle is white (matching background) — should NOT be removed
    const cv = createTestCanvas(100, 100, "#ffffff");
    const ctx = cv.getContext("2d")!;
    // Draw a dark rectangle outline (thick border)
    ctx.fillStyle = "#000000";
    ctx.fillRect(30, 30, 40, 40);
    // Clear the inside to white (enclosed area matching background)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(35, 35, 30, 30);

    removeBg(cv, 40);
    const data = ctx.getImageData(0, 0, 100, 100).data;

    // Corner pixel (outer background) should be transparent
    expect(data[3]).toBe(0);

    // Inner white pixel at (50, 50) should be PRESERVED (opaque)
    const innerIdx = (50 * 100 + 50) * 4;
    expect(data[innerIdx + 3]).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Rewrite removeBg with two-pass + edge-strength check**

Replace the `removeBg` function in `lib/logo-processing.ts`:

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

  const tol = tolerance * tolerance * 3;
  const edgeThreshold = 60 * 60 * 3; // edge-strength threshold

  const matchBg = (i: number) => {
    const dr = px[i] - bgR,
      dg = px[i + 1] - bgG,
      db = px[i + 2] - bgB;
    return dr * dr + dg * dg + db * db <= tol;
  };

  // Edge strength: color distance between two adjacent pixels
  const edgeStrength = (i: number, j: number) => {
    const dr = px[i] - px[j],
      dg = px[i + 1] - px[j + 1],
      db = px[i + 2] - px[j + 2];
    return dr * dr + dg * dg + db * db;
  };

  // Pass 1: Mark outer background region (don't remove yet)
  const toRemove = new Uint8Array(w * h);
  const visited = new Uint8Array(w * h);
  const queue: number[] = [];

  // Seed from edges
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

  while (queue.length) {
    const idx = queue.pop()!;
    const pi = idx * 4;
    if (matchBg(pi)) {
      toRemove[idx] = 1;
      const x = idx % w,
        y = (idx - x) / w;
      for (const [nx, ny] of [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
      ] as [number, number][]) {
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const ni = ny * w + nx;
          if (!visited[ni]) {
            // Edge-strength check: don't cross strong color boundaries
            const npi = ni * 4;
            if (edgeStrength(pi, npi) < edgeThreshold) {
              visited[ni] = 1;
              queue.push(ni);
            }
          }
        }
      }
    }
  }

  // Pass 2: Apply removal only to marked pixels
  for (let i = 0; i < w * h; i++) {
    if (toRemove[i]) {
      px[i * 4 + 3] = 0;
    }
  }

  ctx.putImageData(data, 0, 0);
  return canvas;
}
```

- [ ] **Step 7: Run all tests**

```bash
npm run test
```

Expected: All tests pass, including the new enclosed-area test.

- [ ] **Step 8: Commit**

```bash
git add lib/logo-processing.ts __tests__/logo-processing.test.ts
git commit -m "feat: add hasTransparency, improve removeBg to preserve enclosed areas"
```

---

### Task 9: Logo Controls and Hook Simplification

**Files:**
- Modify: `hooks/use-logo-processor.ts`, `components/logo/logo-controls.tsx`, `app/logo/page.tsx`

- [ ] **Step 1: Update useLogoProcessor with transparency detection**

Rewrite `hooks/use-logo-processor.ts` to:
- Add `isTransparent` state (boolean)
- Add `removeBgEnabled` state (boolean, default true)
- Remove `tolerance` state — use fixed value of 40
- On load: check `hasTransparency`. If transparent, skip removeBg. If not, run removeBg with toggle.
- `updateLogo` becomes simpler: takes `removeBgEnabled`, `recolor`, `customHex`

- [ ] **Step 2: Simplify LogoControls**

Replace the tolerance slider in `components/logo/logo-controls.tsx` with:
- If `isTransparent`: show "Transparent background detected" label, no toggle
- If not transparent: show a toggle switch "Remove background" (On/Off)
- Recolor section stays the same

Update the props interface to match the simplified hook.

- [ ] **Step 3: Update logo page**

Update `app/logo/page.tsx` to pass the new props. Wire `useClipboardPaste`.

- [ ] **Step 4: Verify**

```bash
npm run build
```

Upload a PNG with transparency — should show "Transparent background detected", no toggle. Upload a JPEG — should show toggle. Test recolor still works in both cases.

- [ ] **Step 5: Commit**

```bash
git add hooks/use-logo-processor.ts components/logo/logo-controls.tsx app/logo/page.tsx
git commit -m "feat: simplify logo controls — auto-detect transparency, replace slider with toggle"
```

---

### Task 10: Integration Verification

**Files:** None (testing only)

- [ ] **Step 1: Run all tests**

```bash
npm run test
```

All tests must pass.

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

No type errors.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Build succeeds.

- [ ] **Step 4: Manual smoke test — Crop mode**

Start dev server and verify:
1. Drop image onto "Square" → goes straight to crop editor (no ratio picker)
2. Drop multiple images onto "Experience" → filmstrip appears, all images use 1.4:1
3. Navigate with ←/→ keys between images in filmstrip
4. Click thumbnails in filmstrip to switch
5. "Download all" button appears for multi-image, downloads zip
6. Browse button → ratio picker flow still works
7. Paste an image with Cmd/Ctrl+V → goes to ratio picker → works
8. Ratio picker pre-highlights last used ratio
9. Press Enter on ratio picker → selects highlighted ratio
10. Live preview updates as you drag the crop
11. Preview hidden on narrow window

- [ ] **Step 5: Manual smoke test — Smart Crop mode**

1. Upload multiple images → analysis runs (center crop fallback)
2. Edit view shows live preview on the right
3. Paste works on upload screen
4. Tab shows "Smart Crop" (not "AI Smart Crop")

- [ ] **Step 6: Manual smoke test — Logo mode**

1. Upload PNG with transparent background → "Transparent background detected", no toggle, recolor works
2. Upload JPEG/solid PNG → toggle "Remove background" appears, default On
3. Toggle Off → shows original, recolor applies to all pixels
4. Toggle On → background removed, enclosed areas in letters preserved
5. Paste works on upload screen

- [ ] **Step 7: Manual smoke test — Navigation**

1. Tabs show: Crop | Smart Crop | Logo
2. Keys 1/2/3 navigate correctly
3. URL `/` redirects to `/crop`
4. URL `/single` returns 404 (old route removed)

- [ ] **Step 8: Fix any issues found and commit**

```bash
git add -A
git commit -m "fix: integration testing fixes"
```
