# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run test         # Run all tests (vitest)
npm run test:watch   # Watch mode
npm run lint         # ESLint

# Run a single test file
npx vitest run __tests__/crop-math.test.ts
```

## Architecture

Understory Image Tools — a Next.js 16 (App Router) internal tool with several modes:

- **Crop** (`/crop`) — upload images (click or drop onto ratio cards), adjust crop, batch queue with filmstrip navigation, download individually or as zip
- **Smart Crop** (`/smart-crop`) — batch upload, AI finds focal points (falls back to center crop without API key), review/edit crops, download as zip
- **Logo Processor** (`/logo`) — auto-detect transparency, remove background (toggle, not slider), optional recolor, download PNG
- **Upscale** (`/upscale`) — in-browser AI super-resolution (UpscalerJS + tfjs, no API). Inference runs in a web worker (`lib/upscale.worker.ts`, raw RGB buffers in / RGBA out, tensor-only inside — workers have no Image/document). Upscale mode uses esrgan-thick (best quality; only viable off the main thread), enhance mode uses esrgan-medium (its sources are much larger). If the worker can't start, `lib/upscale.ts` falls back to main-thread esrgan-medium. Sources under 1000px (longest side) default to upscale 2×/4×; larger sources default to "Enhance" — a supersample round-trip (2× up, high-quality downscale back + mild unsharp mask) that keeps dimensions but sharpens/denoises. The default is overridable per image via the ModeToggle in the compare view (only size-cap-ineligible modes are disabled). Transparency is preserved: alpha is resized separately and re-applied; before inference, opaque RGB is bled into transparent regions (`lib/upscale-pixels.ts`) so the model doesn't create dark halos. Do NOT swap in MAXIM models for enhance: they exceed WebGL texture limits or hard-freeze the main thread in-browser (tested). Do NOT use esrgan-thick on the main thread (hangs the tab). Output goes through raw pixels → `canvas.toBlob` object URLs, never base64 (sync base64 encode froze the page). Tiling uses patchSize 128 / padding 8 (padding 2 is the documented minimum before seams show). Size guards in `lib/upscale.ts` cap output at 40MP / 10000px per side. `useUpscale` runs every job (batch, retry, mode toggle, scale change) through ONE queue so two inferences never overlap; a scale change only re-queues upscale-mode items (enhance ignores the factor). Stale results are revoked, and `disposeUpscaler()` frees the worker and model weights after the queue has been idle for 3 minutes (the hook never unmounts, see ToolStateProvider).
- **Extend** (`/extend`) — pad an image out to a target ratio (reuses `RATIOS`) plus a padding % slider, centering the subject. Fill styles: solid color, blurred edge, mirrored edge. Fully client-side (no API). Batch queue + filmstrip like Crop. The preview renders at most `EXTEND_PREVIEW_MAX_SIDE` px straight into the visible canvas (`renderExtended(..., target)`); full resolution only on download, gated by `extendSizeError` (same caps as Upscale). Note: "generative fill" is intentionally NOT here — Anthropic has no image-generation model; the fill-style seam in `lib/extend-utils.ts` is where an outpainting provider (Gemini/OpenAI/Stability) would slot in later.

Modes are registered in `SHORTCUT_MAP.modes` (`lib/constants.ts`), the `tabs` array (`components/nav-tabs.tsx`), and routed via Cmd/Ctrl+1..N in `use-keyboard-shortcuts`.

### Data flow pattern

Pages are thin shells. Each mode has a custom hook that owns all its state; hooks call pure functions from `lib/`.

```
Layout → ToolStateProvider (runs all five hooks once, for the whole session)
             ↓ useToolState().crop / .smartCrop / .extend / .upscale / .logo
           Page → renders UI components with props from the hook
```

The hooks run inside `components/tool-state-provider.tsx`, not the pages, so loaded images, crops and results survive switching tabs and browser back/forward. Pages never call the mode hooks directly. State does not survive a full reload (sources are in-memory object URLs); the hooks release their object URLs in `reset()`. Upscale disposes the worker and model weights after 3 minutes idle rather than on unmount.

### Shared plumbing (use these, don't re-implement)

- **Image sources are object URLs, never data URLs.** `readFileAsImage` (`lib/image-utils.ts`) wraps the File in `URL.createObjectURL`; every hook revokes its sources in `reset()` and on unmount via `revokeSrc`. Previews/results built from canvases go through `canvasToObjectUrl` (async `toBlob`), never `toDataURL`.
- **`loadImageFiles`** (`lib/load-images.ts`) is the one file loader: filters accepted types, decodes, returns `{ images, error }` with the shared "Couldn't read / Skipped N" copy. Hooks expose `reportLoadError` so `useClipboardPaste` can surface paste failures.
- **`prepareFiles` / `validateFiles`** (`lib/file-intake.ts`) own type/size validation and HEIC/SVG conversion for both drop zones and paste. UI copy derives from `ACCEPTED_FORMATS_LABEL` and `MAX_FILE_SIZE_MB`.
- **Downloads return `DownloadResult`** (`lib/download.ts`). Pages wrap every download in `useDownload().run(...)`, which gives a busy flag (buttons show "Preparing…") and an error line. Zip helpers skip failed entries and report the count.
- **Overlay-aware shortcuts.** `HelpPanel` flags itself open in `lib/overlay-state.ts`; `useKeyboardShortcuts` ignores keys while an overlay is open so Escape doesn't also fire the page action.
- **Constants** in `lib/constants.ts`: `MIN_CROP_SIZE`, `EDITOR_INSETS` (via `editorDispSize`), `BG_TOLERANCE`, `EXTEND_PREVIEW_MAX_SIDE`. Crop hooks rescale display sizes and crops on window resize (`useWindowResize` + `rescaleCrop`).

### Key directories

- **`lib/`** — Pure functions with zero React dependencies. All crop math, image processing, and download logic lives here. This is what gets unit tested.
- **`hooks/`** — One hook per mode (`useSingleCrop`, `useMultiCrop`, `useLogoProcessor`) plus shared hooks (`useCropDrag`, `useKeyboardShortcuts`, `useClipboardPaste`).
- **`components/ui/`** — Shared components (Button, Badge, DropZone, SizeInput, KeyboardHint).
- **`components/crop/`** — CropOverlay, ZoomableEditor, RatioPicker, RatioDropZones, ImageFilmstrip.
- **`components/logo/`** — LogoControls (background removal toggle, recolor options).

### Crop mode batch queue

`useSingleCrop` supports both single and multi-image workflows via `CropQueueItem[]`. Key methods:
- `loadWithRatio(files, ratioValue, ratioLabel)` — load images and skip ratio picker (used by ratio drop zones)
- `loadImage(files)` — load images, then show ratio picker
- `navigateTo(idx)` — switch between queued images
- Each image retains its own crop position independently. The ratio is shared across the queue.

### Free crop (null ratio)

When ratio is `null` (Free mode), crop is unconstrained — no aspect ratio enforcement. `clamp()`, `centered()`, `centeredOnBbox()` all accept `number | null`. The drag handler in `useCropDrag` allows independent width/height resizing when ratio is null. `SizeInput` allows independent w/h editing when ratio is null.

### Smart Crop fallback chain

`lib/ai-client.ts` uses `detectFocalWithFallback()`:
1. Browser `FaceDetector` API (Chrome only, no API key needed)
2. Anthropic API via `/api/detect-focal` server-side proxy (requires `ANTHROPIC_API_KEY`)
3. Center crop fallback (no error shown — graceful degradation)

The health check at `/api/detect-focal/health` is called once to determine if the API key is configured, cached client-side. Rate-limit retries are bounded (3, backing off) and reuse the downscaled payload. `MultiCropItem` has a stable `id`; analysis results are written by id so drag-reordering during analysis can't land a result on the wrong image. The route validates mime (jpeg/png/gif/webp), caps payload at 5 MB, applies a best-effort per-IP rate limit, and uses `claude-sonnet-5`.

### Logo background removal

`detectBackground` in `lib/logo-processing.ts` samples 5x5 boxes at the corners of the **opaque** bounding box (not the canvas). For fully opaque images this is the canvas corners. For images with alpha it returns a color only if those corners are mostly opaque and agree on one color; otherwise `color: null`. This catches "transparent" PNG/WebP exports that still carry an opaque white rectangle behind the logo (real-world case: a 300x100 WebP with a 140x90 white box, previously skipped as "already transparent" and returned byte-identical).

`removeBg` uses that color as a soft color key over every pixel (not a flood fill; the old edge fill was redundant because a final pass removed all matching pixels anyway). RGB distance `d` to the background maps to alpha: `d <= 0.6*tolerance` transparent, `d >= 3.2*tolerance` untouched, in between alpha ramps linearly and the background is un-blended from the color (`F = (P - (1-s)*BG) / s`). A hard cut left a whitish fringe of anti-aliased edge pixels on dark surfaces; the ramp plus decontamination gives clean edges. Enclosed areas inside letters (o, b, p) are cleared too, so recolor doesn't fill them. Already-transparent pixels are left alone.

The hook treats an image as "already transparent" (badge, no toggle) only when `hasAlpha && color === null`. It decodes the source and detects the background once, caches the bg-removed canvas per toggle state, and publishes previews as object URLs, so toggling controls never re-scans or base64-encodes the full image.

### Keyboard shortcuts

Handled by `useKeyboardShortcuts` hook. Number keys 1-3 switch modes globally. RatioPicker registers its own listener that overrides 1-4 for ratio selection — pages must pass `disableModeNav: true` when the ratio picker is active to prevent conflicts. Arrow keys navigate batch queue. Enter downloads. Escape goes back.

### Clipboard paste

`useClipboardPaste` hook listens for paste events globally. Active only on upload steps (pass `null` to disable). Handles Cmd+V (Mac) / Ctrl+V (Windows). Platform detected for hint text in drop zones.

## Styling

Tailwind CSS v3 with Understory brand palette defined in `tailwind.config.ts`. Primary color is dark forest green (`#022C12`). Custom animations (`fadeUp`, `spin`, `pulse`) are in the tailwind config `extend.animation`/`extend.keyframes`. Understory logo at `public/logo.png`.

## Testing

Vitest with jsdom environment and `vitest-canvas-mock` for canvas API mocking. Tests cover `lib/` only (pure functions): crop math, image utils, logo processing, download utils. Path alias `@` maps to project root.

## TypeScript gotchas

TS 5.7+ types typed arrays generically: a bare `Uint8ClampedArray` field means
`Uint8ClampedArray<ArrayBufferLike>`, which DOM APIs like `new ImageData(pixels, w, h)`
reject. Declare interface fields holding pixel buffers as `Uint8ClampedArray<ArrayBuffer>`
(see `lib/upscale-tensor.ts`). Surfaces only in `next build`, not in vitest.

## Environment

`ANTHROPIC_API_KEY` — set in `.env.local` (local) or Vercel env vars (production). Smart Crop works without it (falls back to center crop). See `.env.example`.

## Deployment

GitHub repo: `UFilTor/Image-tools`. Deployed via Vercel.

## Aspect ratios

Defined in `lib/constants.ts` as `RATIOS`: Square (1:1), Experience (1.4:1), Cover (54:17), Free (unconstrained). These are Understory-specific presets. Last selected ratio persisted in localStorage (`image-tools:last-ratio`).

## UI consistency

Crop and Smart Crop edit views must use the same layout: header row (title + badge + "N of M" + SizeInput), editor, filmstrip with prev/next buttons, action buttons. Keep these consistent when making changes to either mode.
