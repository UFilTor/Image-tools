# Image Tools — Design Spec

Internal tool for the Understory team. Three image processing modes: Single Crop, AI Smart Crop (batch), and Logo Processor. Built from an existing Claude artifact (~1500 lines, single React component) being refactored into a production-grade Next.js application.

## Goals

- Same functionality as the existing artifact — no feature additions, no feature removals
- Clean architecture that's easy to iterate on
- Zero configuration for team members — open URL and use
- Keyboard-driven workflow for power users
- Robust error handling throughout

## Tech Stack

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Next.js (App Router) | URL-based routing, API routes for server-side proxy, code splitting per mode |
| Styling | Tailwind CSS | Matches existing Understory tooling (fee-calculator), team familiarity |
| State management | Custom hooks per mode | Three modes are independent — no shared state. `useSingleCrop()`, `useMultiCrop()`, `useLogoProcessor()` |
| Testing | Vitest — unit tests on `lib/` | Highest ROI: crop math, image utils, logo processing are where bugs hide |
| API key | Server-side env var + Next.js API route | Zero config for users. `ANTHROPIC_API_KEY` in `.env.local`, proxied via `/api/detect-focal` |
| Zip library | JSZip via npm | Replaces CDN script injection from artifact |

## Routes

| Path | Mode | Description |
|------|------|-------------|
| `/` | — | Redirects to `/single` |
| `/single` | Single Crop | Upload one image, pick ratio, adjust crop, download |
| `/smart-crop` | AI Smart Crop | Upload multiple images, Claude finds focal points, batch crop |
| `/logo` | Logo Processor | Upload logo, remove background, optional recolor, download |

Tab navigation in the shared layout switches between routes. Each mode loads independently (code-split).

## Project Structure

```
image-tools/
├── app/
│   ├── layout.tsx              # Shell: header, tab nav, keyboard listener
│   ├── page.tsx                # Redirects to /single
│   ├── single/page.tsx         # Single crop mode
│   ├── smart-crop/page.tsx     # AI batch crop mode
│   ├── logo/page.tsx           # Logo processor mode
│   └── api/detect-focal/route.ts  # Anthropic API proxy
├── components/
│   ├── ui/                     # Shared: button, badge, drop-zone, size-input, keyboard-hint
│   ├── crop/                   # crop-overlay, zoomable-editor, ratio-picker
│   └── logo/                   # logo-controls
├── hooks/
│   ├── use-single-crop.ts
│   ├── use-multi-crop.ts
│   ├── use-logo-processor.ts
│   └── use-keyboard-shortcuts.ts
├── lib/
│   ├── crop-math.ts            # clamp, centered, centeredOnBbox
│   ├── image-utils.ts          # cropToBlob, dispSize, cropFilename
│   ├── logo-processing.ts      # removeBg, recolorCanvas
│   ├── ai-client.ts            # calls /api/detect-focal
│   ├── download.ts             # dlCrop, dlAll, dlCanvas
│   └── constants.ts            # RATIOS, shortcut map
├── __tests__/
│   ├── crop-math.test.ts
│   ├── image-utils.test.ts
│   ├── logo-processing.test.ts
│   └── download.test.ts
├── styles/globals.css          # Tailwind + Understory design tokens
├── tailwind.config.ts
├── next.config.ts
├── vitest.config.ts
├── .env.local                  # ANTHROPIC_API_KEY (not committed)
└── package.json
```

## Architecture

### Data flow

Pages are thin shells. Each page calls its custom hook, which owns all state and orchestrates logic. The hooks call pure functions from `lib/`.

```
Page component → Custom hook (state) → Pure functions (lib/)
     ↓                                        ↑
  Renders UI components              No React dependencies,
  with props from hook               fully unit-testable
```

### API route: `/api/detect-focal`

Server-side proxy to Anthropic. The browser sends image data (base64) to this route. The route reads `ANTHROPIC_API_KEY` from `process.env`, forwards to `api.anthropic.com/v1/messages`, and returns the parsed bounding box.

Request: `POST /api/detect-focal` with `{ src: string, mime: string }`
Response: `{ bbox: { x1, y1, x2, y2 } | null, label: string, error?: string }`

### Understory design tokens

The existing artifact defines a color palette (`C` object). These become Tailwind CSS custom colors in `tailwind.config.ts`, mapped from the Understory brand palette:

- `primary`: `#022C12` (dark green)
- `primary-hover`: `#04391A`
- `surface`: `#F5F6F4`
- `border`: `#D9DDD8`
- `accent`: `#F1F97E`
- `error`: `#C62828`
- Full palette carried over from artifact

## Keyboard Shortcuts

Context-aware number keys. Disabled when an input field is focused.

### Global (always active, unless on ratio picker)

| Key | Action |
|-----|--------|
| `1` | Navigate to Single Crop |
| `2` | Navigate to AI Smart Crop |
| `3` | Navigate to Logo Processor |

### Ratio Picker (overrides global number keys)

| Key | Action |
|-----|--------|
| `1` | Square (1:1) |
| `2` | Experience (1.4:1) |
| `3` | Cover (54:17) |
| `4` | Free (Original) |

### Crop Editor

| Key | Action |
|-----|--------|
| `Enter` | Download crop |
| `Escape` | Go back one step |

### Batch Edit View

| Key | Action |
|-----|--------|
| `←` | Previous image |
| `→` | Next image |
| `Enter` | Download current |
| `Escape` | Back to grid |

Implementation: A single `useKeyboardShortcuts` hook registered in the layout. It receives the current context (which view is active) and dispatches accordingly. Each page passes its available actions to the hook.

## Error Handling

### Upload validation

- Accept only PNG, JPG, WebP (`image/png`, `image/jpeg`, `image/webp`)
- Max file size: 20MB per file
- Rejected files show inline error message in the drop zone

### AI Smart Crop API

- 30-second timeout per request (AbortController)
- Rate limit errors: retry with exponential backoff, up to 3 attempts
- Per-image errors don't block the rest of the batch
- Each card in the review grid shows its own error state with retry button (preserved from artifact)

### Canvas operations

- try/catch around `cropToBlob`, `removeBg`, `recolorCanvas`
- Corrupted or unreadable images surface a user-friendly message
- CORS errors caught and surfaced

### Downloads

- JSZip imported as npm dependency (dynamic import for code splitting)
- Individual crop failures during batch zip are skipped, not fatal
- Zip generation failure shows fallback error message

## Testing Strategy

Unit tests with Vitest on all `lib/` modules. These are pure functions with no DOM or React dependencies (canvas operations will use `jest-canvas-mock` or equivalent).

### Test coverage targets

**crop-math.ts:**
- `clamp()` — boundary enforcement: crop stays within image bounds, minimum size enforced, aspect ratio maintained
- `centered()` — default crop fills 80% of display area, centered
- `centeredOnBbox()` — crop centers on bounding box, expands to fill available space, handles edge cases (bbox at image edge, bbox larger than display)
- `dispSize()` — scales to fit viewport constraints

**image-utils.ts:**
- `cropFilename()` — generates `name_crop.png` from input, handles missing extension, handles empty input
- `dispSize()` — respects max width/height, maintains aspect ratio

**logo-processing.ts:**
- `removeBg()` — flood-fill from edges removes background color within tolerance
- `recolorCanvas()` — replaces all visible pixels with target color, preserves alpha

**download.ts:**
- `cropToBlob()` — produces correct canvas dimensions from crop coordinates
- Filename generation for batch downloads

## Scope Boundaries

### In scope (this build)

- All three modes with full artifact functionality
- Next.js project scaffolding with Tailwind
- Component decomposition from monolith
- Server-side API proxy
- Keyboard shortcuts
- Error handling
- Unit tests on lib/
- Basic responsive layout

### Out of scope (future iterations)

- Authentication / access control
- Undo/redo
- Component and E2E tests
- Dark mode
- Image format conversion
- Batch logo processing
- Persistent crop history
