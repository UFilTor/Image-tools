# Image Tools v2 — Improvements Spec

Six improvements to reduce friction in the cropping workflow and fix logo processing quality. All changes are additive — no existing functionality is removed.

## Goals

- Fewer clicks to get from image to crop
- Support batch workflows in manual crop mode
- Fix logo background removal quality (flood-fill bleeding into enclosed letter areas)
- Simplify logo UI by removing the tolerance slider

## Route Rename

`/single` → `/crop`. Update route directory, nav tabs, page titles, redirect, keyboard shortcut labels. "Single" → "Crop" everywhere in the UI. "AI Smart Crop" → "Smart Crop". Logo stays as is.

Nav tabs become: **Crop** | **Smart Crop** | **Logo**

---

## 1. Remember Last Ratio

**What:** Persist the last-selected ratio in `localStorage`. Pre-highlight it in the ratio picker on next visit.

**Behavior:**
- When the user picks a ratio, save the label (e.g., "Square") to `localStorage` under key `image-tools:last-ratio`
- On ratio picker mount, read the stored value and pre-highlight that option
- If the user presses Enter without clicking a ratio, select the pre-highlighted one
- Default to "Square" if nothing is stored
- Applies to both Crop and Smart Crop modes

**Files affected:**
- `lib/constants.ts` — add `STORAGE_KEYS.lastRatio`
- `components/crop/ratio-picker.tsx` — read/write localStorage, pre-highlight logic

---

## 2. Clipboard Paste

**What:** Paste images from clipboard via Cmd+V (Mac) / Ctrl+V (Windows) to upload directly.

**Behavior:**
- Global `paste` event listener registered in the layout
- On paste, check `clipboardData.files` and `clipboardData.items` for image types
- If image found, route to the current page's upload handler
- Disabled when an input field is focused (same guard as keyboard shortcuts)
- Works on all three modes (Crop, Smart Crop, Logo)
- Drop zone hint text updated: "Drop image here, **paste**, or browse"

**Implementation:**
- New hook: `hooks/use-clipboard-paste.ts` — listens for paste events, extracts image files, calls provided callback
- Each page passes its upload handler to the hook
- Platform detection for hint text: show "Cmd+V" on Mac, "Ctrl+V" on Windows

**Files affected:**
- `hooks/use-clipboard-paste.ts` (new)
- `app/crop/page.tsx`, `app/smart-crop/page.tsx`, `app/logo/page.tsx` — wire up paste hook
- `components/ui/drop-zone.tsx` — add paste hint text

---

## 3. Drop Into Ratio

**What:** Replace the single drop zone on the Crop upload screen with ratio-specific drop targets. Drop an image onto "Square" and go straight to the crop editor.

**Behavior:**
- Upload screen shows 4 drop zones in a 2×2 grid, one per ratio: Square, Experience, Cover, Free
- Each zone accepts drag-and-drop and shows the ratio label/subtitle
- Dropping an image onto a zone sets that ratio AND loads the image, skipping the ratio picker step entirely
- A general "browse" button below the grid opens the file picker — after selecting, the ratio picker appears as before (fallback flow)
- Clipboard paste goes through the fallback flow (paste → ratio picker → crop)
- If multiple files are dropped onto a ratio zone, all are loaded into the batch queue (see improvement 5) with that ratio selected

**Files affected:**
- `app/crop/page.tsx` — new upload layout with ratio drop zones
- `hooks/use-single-crop.ts` — new `loadWithRatio(files, ratioValue, ratioLabel)` method that combines load + ratio selection

---

## 4. Live Crop Preview

**What:** Show a real-time preview of the cropped result next to the editor.

**Behavior:**
- In the crop editor view (both Crop and Smart Crop edit mode), render a preview panel to the right of the ZoomableEditor
- Preview is a `<canvas>` that redraws on every crop change (debounced to ~60fps)
- Preview size: fixed width of 200px, height determined by the crop aspect ratio
- Shows exactly what the downloaded file will look like
- Hidden on viewports narrower than 900px (the editor needs the space)
- On wide viewports, the editor and preview sit side by side in a flex row. The editor keeps its current size; the preview panel takes the remaining space (max 200px wide)
- Label above preview: "Preview"

**Implementation:**
- New component: `components/crop/crop-preview.tsx`
- Receives `src`, `nat`, `disp`, `crop` props
- Uses `useEffect` + `requestAnimationFrame` to redraw when crop changes
- Draws directly to canvas (no intermediate blob) for performance

**Files affected:**
- `components/crop/crop-preview.tsx` (new)
- `app/crop/page.tsx` — add preview next to editor
- `app/smart-crop/page.tsx` — add preview in edit view

---

## 5. Batch Single Crops

**What:** Allow multiple images in Crop mode with a filmstrip navigator.

**Behavior:**
- Upload accepts multiple files (change `multiple` prop on drop zone / file input)
- When multiple images are loaded, a filmstrip/thumbnail bar appears below the crop editor
- Filmstrip shows small thumbnails (~64px) with status indicators:
  - Gray border: pending (not yet cropped)
  - Green border: crop adjusted
  - Current image highlighted with primary border
- `←` / `→` keys navigate between images (saving current crop position before switching)
- Each image retains its own crop position independently
- The selected ratio applies to all images (shared)
- "Download all" button appears when 2+ images are loaded — exports all as zip using existing `dlAll` infrastructure
- Single image upload still works exactly as before (no filmstrip shown)

**Implementation:**
- Refactor `hooks/use-single-crop.ts` → support array of images with per-image crop state
- New type: `CropQueueItem { src, name, nat, disp, crop, status }`
- New component: `components/crop/image-filmstrip.tsx` — horizontal scrollable thumbnail bar
- Reuse `dlAll` from `lib/download.ts` (adapt to work with `CropQueueItem` array)

**Files affected:**
- `hooks/use-single-crop.ts` — refactor from single image to queue
- `components/crop/image-filmstrip.tsx` (new)
- `app/crop/page.tsx` — add filmstrip, download all button, multi-file upload
- `lib/download.ts` — minor adaptation for CropQueueItem
- `lib/types.ts` — add `CropQueueItem` interface

---

## 6. Logo Processor Overhaul

Three sub-changes:

### 6a. Auto-detect Transparency

When a logo is uploaded, scan the alpha channel for transparent pixels.

- **If transparent pixels found:** skip background removal entirely. Hide the toggle. Show label: "Transparent background detected". Go straight to recolor options.
- **If no transparency:** show the background removal toggle (see 6b).

New function: `hasTransparency(canvas: HTMLCanvasElement): boolean` in `lib/logo-processing.ts`. Samples the alpha channel — if any pixel has alpha < 250, returns true.

### 6b. Simplified UI — Toggle Instead of Slider

Replace the tolerance slider with a simple on/off toggle:
- **"Remove background"** toggle — On by default for non-transparent images
- When On: runs background removal with a fixed tolerance of 40
- When Off: shows original image (background intact)
- No slider, no fine-tuning

The `LogoControls` component is simplified: tolerance slider removed, replaced with a toggle switch.

### 6c. Improved Flood-Fill — Don't Bleed Into Enclosed Areas

The current flood-fill seeds from all edges and removes any pixel within tolerance of the background color. This bleeds through thin letter strokes into enclosed areas (e.g., the inside of the "o" in "MobilePay" gets removed when it shouldn't).

**Fix:** Two-pass approach:
1. **Pass 1 — Identify outer region:** Flood-fill from edges, same as now. Mark every reachable pixel as "outer background." But tighten the tolerance for crossing narrow gaps: when a pixel is adjacent to a non-background pixel, require a stricter match before continuing the flood.
2. **Pass 2 — Remove only outer region:** Apply transparency only to pixels marked in pass 1. Interior regions that happen to match the background color but aren't connected to the edges are preserved.

The key change: currently the flood-fill removes pixels as it goes. The new version marks first, then removes. This means enclosed areas (inside letters, inside logo shapes) that match the background color are preserved because the flood-fill can't reach them through the logo boundary.

Additionally, add an **edge-strength check**: before the flood-fill crosses from one pixel to the next, check if there's a strong color gradient between them. If the gradient exceeds a threshold (initial value: 60 color distance), don't cross — this prevents leaking through thin strokes even if both sides are within tolerance of the background color. This value may need tuning during implementation.

**Files affected:**
- `lib/logo-processing.ts` — add `hasTransparency`, rewrite `removeBg` with two-pass + edge-strength check
- `components/logo/logo-controls.tsx` — replace slider with toggle
- `hooks/use-logo-processor.ts` — add transparency detection, simplify state (remove tolerance)
- `app/logo/page.tsx` — update UI for transparency state
- `__tests__/logo-processing.test.ts` — update tests for new behavior

---

## Testing

**New tests:**
- `hasTransparency` — returns true for transparent canvas, false for opaque
- Updated `removeBg` tests — verify enclosed areas are preserved (the MobilePay case)
- `cropFilename` with queue items (batch download)

**Existing tests:** All existing crop-math, image-utils, and download tests remain unchanged.

---

## Scope Boundaries

### In scope
- All 6 improvements described above
- Route rename `/single` → `/crop`
- Nav label changes

### Out of scope
- Quick export presets (explicitly removed)
- Dark mode
- Undo/redo
- Mobile touch support for crop drag
- Any new aspect ratios
