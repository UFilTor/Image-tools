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

- **Single Crop** (`/single`) — upload, pick aspect ratio, adjust crop, download
- **AI Smart Crop** (`/smart-crop`) — batch upload, AI finds focal points, review/edit crops, download as zip
- **Logo Processor** (`/logo`) — remove background via flood-fill, optional recolor, download PNG

### Data flow pattern

Pages are thin shells. Each page calls a custom hook that owns all state. Hooks call pure functions from `lib/`.

```
Page → Custom Hook (state) → Pure Functions (lib/)
 ↓
Renders UI components with props from hook
```

### Key directories

- **`lib/`** — Pure functions with zero React dependencies. All crop math, image processing, and download logic lives here. This is what gets unit tested.
- **`hooks/`** — One hook per mode (`useSingleCrop`, `useMultiCrop`, `useLogoProcessor`) plus shared hooks (`useCropDrag`, `useKeyboardShortcuts`).
- **`components/ui/`** — Shared components (Button, Badge, DropZone, SizeInput, KeyboardHint).
- **`components/crop/`** — CropOverlay (draggable rectangle), ZoomableEditor (scroll-to-zoom canvas), RatioPicker.
- **`components/logo/`** — LogoControls (tolerance slider, recolor options).

### AI Smart Crop fallback chain

`lib/ai-client.ts` uses `detectFocalWithFallback()`:
1. Browser `FaceDetector` API (Chrome only, no API key needed)
2. Anthropic API via `/api/detect-focal` server-side proxy (requires `ANTHROPIC_API_KEY`)
3. Center crop fallback (no error shown — graceful degradation)

The health check at `/api/detect-focal/health` is called once to determine if the API key is configured, cached client-side.

### Keyboard shortcuts

Handled by `useKeyboardShortcuts` hook. Number keys 1-3 switch modes globally. RatioPicker registers its own listener that overrides 1-4 for ratio selection — pages must pass `disableModeNav: true` when the ratio picker is active to prevent conflicts.

## Styling

Tailwind CSS v3 with Understory brand palette defined in `tailwind.config.ts`. Primary color is dark forest green (`#022C12`). Custom animations (`fadeUp`, `spin`, `pulse`) are in the tailwind config `extend.animation`/`extend.keyframes`.

## Testing

Vitest with jsdom environment and `vitest-canvas-mock` for canvas API mocking. Tests cover `lib/` only (pure functions): crop math, image utils, logo processing, download utils. Path alias `@` maps to project root.

## Environment

`ANTHROPIC_API_KEY` — set in `.env.local` (local) or Vercel env vars (production). The AI Smart Crop feature works without it (falls back to center crop). See `.env.example`.

## Aspect ratios

Defined in `lib/constants.ts` as `RATIOS`: Square (1:1), Experience (1.4:1), Cover (54:17), Free (original). These are Understory-specific presets.
