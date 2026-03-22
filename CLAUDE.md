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

Understory Image Tools — a Next.js 16 (App Router) internal tool with three modes:

- **Crop** (`/crop`) — upload images (click or drop onto ratio cards), adjust crop, batch queue with filmstrip navigation, download individually or as zip
- **Smart Crop** (`/smart-crop`) — batch upload, AI finds focal points (falls back to center crop without API key), review/edit crops, download as zip
- **Logo Processor** (`/logo`) — auto-detect transparency, remove background (toggle, not slider), optional recolor, download PNG

### Data flow pattern

Pages are thin shells. Each page calls a custom hook that owns all state. Hooks call pure functions from `lib/`.

```
Page → Custom Hook (state) → Pure Functions (lib/)
 ↓
Renders UI components with props from hook
```

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

The health check at `/api/detect-focal/health` is called once to determine if the API key is configured, cached client-side.

### Logo background removal

`removeBg` in `lib/logo-processing.ts` uses a three-pass approach:
1. **Flood-fill from edges** — only queues neighbors that match the background color (prevents crossing dark strokes)
2. **Mark outer region** — pixels reachable from edges that match background
3. **Remove ALL background-matching pixels** — including enclosed areas inside letters (e.g., inside "o", "b", "p"). This ensures recolor doesn't fill in letter interiors.

`hasTransparency()` checks if the image already has alpha. If so, background removal is skipped entirely.

### Keyboard shortcuts

Handled by `useKeyboardShortcuts` hook. Number keys 1-3 switch modes globally. RatioPicker registers its own listener that overrides 1-4 for ratio selection — pages must pass `disableModeNav: true` when the ratio picker is active to prevent conflicts. Arrow keys navigate batch queue. Enter downloads. Escape goes back.

### Clipboard paste

`useClipboardPaste` hook listens for paste events globally. Active only on upload steps (pass `null` to disable). Handles Cmd+V (Mac) / Ctrl+V (Windows). Platform detected for hint text in drop zones.

## Styling

Tailwind CSS v3 with Understory brand palette defined in `tailwind.config.ts`. Primary color is dark forest green (`#022C12`). Custom animations (`fadeUp`, `spin`, `pulse`) are in the tailwind config `extend.animation`/`extend.keyframes`. Understory logo at `public/logo.png`.

## Testing

Vitest with jsdom environment and `vitest-canvas-mock` for canvas API mocking. Tests cover `lib/` only (pure functions): crop math, image utils, logo processing, download utils. Path alias `@` maps to project root.

## Environment

`ANTHROPIC_API_KEY` — set in `.env.local` (local) or Vercel env vars (production). Smart Crop works without it (falls back to center crop). See `.env.example`.

## Deployment

GitHub repo: `UFilTor/Image-tools`. Deployed via Vercel.

## Aspect ratios

Defined in `lib/constants.ts` as `RATIOS`: Square (1:1), Experience (1.4:1), Cover (54:17), Free (unconstrained). These are Understory-specific presets. Last selected ratio persisted in localStorage (`image-tools:last-ratio`).

## UI consistency

Crop and Smart Crop edit views must use the same layout: header row (title + badge + "N of M" + SizeInput), editor, filmstrip with prev/next buttons, action buttons. Keep these consistent when making changes to either mode.
