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
- **Logo Processor** (`/logo`) — auto-detect transparency, remove background (Off / Solid color / AI), targeted color changes (pick a color, optionally limit to an area), "Ask Claude" prompt edits, optional whole-logo recolor, download PNG
- **Upscale** (`/upscale`) — in-browser AI super-resolution (UpscalerJS + tfjs, no API). Inference runs in a web worker (`lib/upscale.worker.ts`, raw RGB buffers in / RGBA out, tensor-only inside — workers have no Image/document). Upscale mode uses esrgan-thick (best quality; only viable off the main thread), enhance mode uses esrgan-medium (its sources are much larger). If the worker can't start, `lib/upscale.ts` falls back to main-thread esrgan-medium. Sources under 1000px (longest side) default to upscale at the batch factor, 4× unless changed; larger sources default to "Enhance" — a supersample round-trip (2× up, high-quality downscale back + mild unsharp mask) that keeps dimensions but sharpens/denoises. The UI presents both as one "improve" action with an output size per image: SizeToggle in the compare view (Same size = enhance, 2× / 4× = upscale; only size-cap-ineligible options are disabled). The 2×/4× factor is shared by the batch, so a one-click size change goes through `changeSize`, which rescales with the item already switched to upscale; calling changeScale + changeMode in one handler would queue the item with the stale factor. Transparency is preserved: alpha is resized separately and re-applied; before inference, opaque RGB is bled into transparent regions (`lib/upscale-pixels.ts`) so the model doesn't create dark halos. Do NOT swap in MAXIM models for enhance: they exceed WebGL texture limits or hard-freeze the main thread in-browser (tested). Do NOT use esrgan-thick on the main thread (hangs the tab). Output goes through raw pixels → `canvas.toBlob` object URLs, never base64 (sync base64 encode froze the page). Tiling uses patchSize 128 / padding 8 (padding 2 is the documented minimum before seams show). Size guards in `lib/upscale.ts` cap output at 40MP / 10000px per side. `useUpscale` runs every job (batch, retry, mode toggle, scale change) through ONE queue so two inferences never overlap; a scale change only re-queues upscale-mode items (enhance ignores the factor). Stale results are revoked, and `disposeUpscaler()` frees the worker and model weights after the queue has been idle for 3 minutes (the hook never unmounts, see ToolStateProvider).
- **Extend** (`/extend`) — pad an image out to a target ratio (reuses `RATIOS`) plus a padding % slider, centering the subject. Fill styles: solid color, blurred edge, mirrored edge, all client-side (an AI generative fill was removed on 2026-10-21 at Filip's request). Batch queue + filmstrip like Crop. The preview renders at most `EXTEND_PREVIEW_MAX_SIDE` px straight into the visible canvas (`renderExtended(..., target)`); full resolution only on download, gated by `extendSizeError` (same caps as Upscale). `renderExtended` always draws the sharp original on top, so original pixels never change.

Modes are registered in `SHORTCUT_MAP.modes` and `TOOLS` (both `lib/constants.ts`; `TOOLS` feeds the nav tabs, their hover tooltips and the start page at `/`), and routed via Cmd/Ctrl+1..N in `use-keyboard-shortcuts`. `/` is a start page with one card per tool (it used to redirect to /crop, and a first-time user test showed newcomers guessing which tab to use).

### Data flow pattern

Pages are thin shells. Each mode has a custom hook that owns all its state; hooks call pure functions from `lib/`.

```
Layout → ToolStateProvider (runs all five hooks once, for the whole session)
             ↓ useToolState().crop / .smartCrop / .extend / .upscale / .logo
           Page → renders UI components with props from the hook
```

The hooks run inside `components/tool-state-provider.tsx`, not the pages, so loaded images, crops and results survive switching tabs and browser back/forward. Pages never call the mode hooks directly. State does not survive a full reload (sources are in-memory object URLs); the hooks release their object URLs in `reset()`. Upscale disposes the worker and model weights after 3 minutes idle rather than on unmount.

**Send to** (`components/ui/send-to.tsx`): each result's action row offers the next tools from `SEND_TARGETS` (`lib/constants.ts`). The provider's `sendTo` resets the target tool, loads the file through the same loader its drop zone uses, then navigates, so a sent image starts exactly like a dropped one. It replaces whatever the target held. The row sits inside the existing action row on purpose: a row of its own made the Logo and crop editors scroll.

**Redraw hint** (`components/upscale/redraw-hint.tsx`): when Upscale's current image looks like a logo (`lib/looks-like-logo.ts`: flat-color share plus soft-gradient share, calibrated on 54 real images) and the AI Gateway is configured, the header offers "Redraw in Logo · ~$0.04". The click sends the original to Logo and starts Redraw with `CRISPER_INSTRUCTION`; Logo shows the result as a candidate to keep or discard. Never automatic, because Redraw costs money and can change letter shapes.

### Shared plumbing (use these, don't re-implement)

- **Image sources are object URLs, never data URLs.** `readFileAsImage` (`lib/image-utils.ts`) wraps the File in `URL.createObjectURL`; every hook revokes its sources in `reset()` and on unmount via `revokeSrc`. Previews/results built from canvases go through `canvasToObjectUrl` (async `toBlob`), never `toDataURL`.
- **`loadImageFiles`** (`lib/load-images.ts`) is the one file loader: filters accepted types, decodes, returns `{ images, error }` with the shared "Couldn't read / Skipped N" copy. Hooks expose `reportLoadError` so `useClipboardPaste` can surface paste failures.
- **`prepareFiles` / `validateFiles`** (`lib/file-intake.ts`) own type/size validation and HEIC/SVG conversion for both drop zones and paste. UI copy derives from `ACCEPTED_FORMATS_LABEL` and `MAX_FILE_SIZE_MB`.
- **Downloads return `DownloadResult`** (`lib/download.ts`). Pages wrap every download in `useDownload().run(...)`, which gives a busy flag (buttons show "Preparing…") and an error line. Zip helpers skip failed entries and report the count.
- **Overlay-aware shortcuts.** `HelpPanel` flags itself open in `lib/overlay-state.ts`; `useKeyboardShortcuts` ignores keys while an overlay is open so Escape doesn't also fire the page action.
- **Rate limits** (`lib/rate-limit.ts`): one named bucket per API route in `RATE_LIMITS` (the paid `image-edit` gets 10/min); a new route must add its own bucket.
- **Small shared helpers**: `errorMessage` / `userMessage` (`lib/errors.ts`) in catch blocks (`userMessage` turns a browser network failure into one offline message), `upstreamMessage` (`lib/brand-scrape/fetch.ts`) for Node's bare "fetch failed", `clientIp` prefers Vercel's unspoofable `x-real-ip`, `isControlTarget` (`lib/keyboard.ts`) for the Enter rule, `sizeChangePlan` / `tooLargeForAnySize` (`lib/upscale.ts`), `canvasToBlob` (`lib/image-utils.ts`), `checkerBg(size)` (`lib/constants.ts`) for transparent previews, `clamp01` (`lib/logo-edits.ts`), `LoadError` under every upload drop zone (hooks set `loadError`; before, nothing rendered it). `/api/image-edit` returns raw image bytes; `requestImageEdit` decodes them via a revoked object URL.
- **Constants** in `lib/constants.ts`: `MIN_CROP_SIZE`, `EDITOR_INSETS` (via `editorDispSize`), `BG_TOLERANCE`, `EXTEND_PREVIEW_MAX_SIDE`. Crop hooks rescale display sizes and crops on window resize (`useWindowResize` + `rescaleCrop`).

### Key directories

- **`lib/`** — Pure functions with zero React dependencies. All crop math, image processing, and download logic lives here. This is what gets unit tested.
- **`hooks/`** — One hook per mode (`useSingleCrop`, `useMultiCrop`, `useLogoProcessor`) plus shared hooks (`useCropDrag`, `useKeyboardShortcuts`, `useClipboardPaste`).
- **`components/ui/`** — Shared components (Button, Badge, DropZone, SizeInput, KeyboardHint).
- **`components/crop/`** — CropOverlay, ZoomableEditor, RatioPicker, RatioDropZones, ImageFilmstrip.
- **`components/logo/`** — LogoControls (background mode, recolor; color-change list goes in its slot), ColorEdits, AiAssist (one prompt: "Change colors" via Claude, "Redraw image" via AI Gateway), PreviewTools (picker / area overlay on the processed preview). The Logo edit view uses the Extend layout: one large preview left ("Show original" toggle + hover compare), controls right. On lg screens both share a viewport-fitted height (`calc(100dvh-272px)` / `-238px`) so the page never scrolls; only the controls column does. The preview image is `object-contain` inside that box, so PreviewTools maps pointer coordinates to the drawn picture, not the element box.
- **`lib/claude.ts`** — the one Claude model ID, headers and image limits shared by every API route; **`lib/rate-limit.ts`** — the shared per-IP limiter.

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

The health check at `/api/detect-focal/health` is called once to determine if the API key is configured, cached client-side. Rate-limit retries are bounded (3, backing off) and reuse the downscaled payload. `MultiCropItem` has a stable `id`; analysis results are written by id so drag-reordering during analysis can't land a result on the wrong image. The route validates mime (jpeg/png/gif/webp), caps payload at 5 MB, applies a best-effort per-IP rate limit, and uses `claude-sonnet-5-5` at low effort (thinking counts against `max_tokens`, so keep headroom) with server-side refusal fallback.

### Logo pipeline

`useLogoProcessor` renders in three stages: **base** (background mode, cached per mode as a promise) → **edits** (`applyEdits`, `lib/logo-edits.ts`, color changes and erases in order) → **whole-logo recolor** → **background fill** (`fillCanvas`, painted behind transparent areas, so edits and recolor never touch it; cleared when removal goes Off on an opaque logo, where it couldn't show: `canFillBackground`). Picking and Ask Claude read the edited stage; download exports the final one.

- **Erase edits** (`eraseShapes`) remove whole shapes, not rectangles: every 8-connected foreground shape with at least 40% of its pixels inside the box goes, including its part outside the box. A rough box around the Widmarks shark removed all of it and left the text. Ask AI returns `erase` boxes for "remove ..." requests (diffusion models can't erase; see AI Gateway notes).
- **Color edits** shift pixels near `from` by `to - from` inside an optional box, so shading and JPEG noise survive. Anti-aliased edges are projected onto the line to the neighbouring color; edges that only border transparency are projected against the keyed-out background (`bgHint`, Solid color mode only). The off-line check is 2× tolerance because JPEG chroma noise tints white letters blue by ~45 units (real case: Widmarks logo, 81 interior pixels stayed white at 1×).
- **Ask Claude** (`/api/logo-edit`): Claude can't output pixels, so it returns a plan `{edits, erase, background, fill, note}` via structured output (prompt and schema in `lib/logo-edit-prompt.ts`, tested). The client names the kept solid background color (`bgColor`, snapped to the palette): without it Claude said it "can't" set a background color and recolored the background along with the text (2026-10-21). A transparent background gets a color through `fill` instead. `from` is an enum of the measured palette (`extractPalette`), so edits always target real colors. Claude's boxes run tight (it cut the Widmarks text at row 18 of 25), so the hook grows each box with `snapBox` to whole same-colored shapes it cuts through; shapes less than 25% inside stay out.
- **AI background removal**: `lib/bg-removal.worker.ts` runs transformers.js with `onnx-community/ormbg-ONNX` (Apache-2.0, q8, 44 MB from Hugging Face on first use, browser-cached). The raw mask is soft (subjects at alpha ~140-210), so `sharpenMask` applies a smoothstep. Worker is disposed after 3 minutes idle. License note: do NOT swap in `briaai/RMBG-1.4` (non-commercial), `@imgly/background-removal` or `ISNet-ONNX` (AGPL). Vercel AI Gateway (team has credits) has no matte model, only generative editors that redraw the logo.

### AI Gateway image models

`lib/gateway.ts` + `/api/image-edit` (prompts are framed server-side, but the logo redraw takes a free instruction, so the route can edit any image: keep a spend limit on the AI Gateway team). Auth: `AI_GATEWAY_API_KEY`, else the OIDC token. On Vercel it only arrives as the `x-vercel-oidc-token` request header (the `VERCEL_OIDC_TOKEN` env var exists in builds and local dev only), so pass `req.headers` to `gatewayToken`; locally it comes from `vercel env pull` and expires after 12 hours. Findings from testing on 2026-10-20, team on free-tier credits:
- `openai/gpt-image-2` is refused on free-tier credits. Top up to use it.
- `bfl/flux-pro-1.0-fill` (was Extend's AI fill, removed 2026-10-21; kept as a note): mask is BFL style, WHITE = generate, BLACK = keep, opaque. A transparent OpenAI-style mask is silently ignored (margins came back black). Keeps the input size, even 3:1. ~$0.05, 13-25 s.
- `bfl/flux-kontext-pro` (Logo Redraw): picks its own frame up to ~21:9 and crops the rest, so `lib/logo-redraw.ts` pads to 21:9 and trims back. It also degrades the outer edge, so trimming compares against the known padding color and skips a 2% ring. Results vary per run; the redraw is only a candidate shown next to the current logo. ~$0.04, 7-10 s.
- Diffusion models follow nouns. "Remove the shark" drew a new shark; "plain empty blue" invented fake text. Don't use these models to erase parts of a logo.

### Fetch from a website

`components/ui/from-website.tsx` sits under every upload drop zone and feeds the page's paste loader. `lib/brand-scrape/` and `/api/scrape` + `/api/image` are copied from `~/brand-scrape-kit` (fixture tests in `__tests__/brand-scrape.test.ts`). Differences from the kit: `fetch.ts` resolves DNS on every redirect hop and refuses private addresses (the kit only checks the hostname text; `localtest.me` → 127.0.0.1 got through), `withProtocol` lives in `fetch.ts`, and both routes are rate-limited. `isPrivateAddress` parses IPv6 fully: the URL parser rewrites `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`, which slipped past string checks and let the scraper read this machine's own server (found by the breaker agent; tests cover every spelling). Keep the proxy's sandbox CSP and nosniff headers. Ported from kit v3 on 2026-10-22 (photos only; crawl fallbacks, colours and logos were not): every `extractPhotos` source goes through `looksLikePhoto` (logo words are matched on the URL path, not the host) (the logo file is never a photo, even as og:image; Wix `w_/h_` sizes and `blur_` placeholders, video thumbnails and `.svg#fragment` are rejected), `photoKey` keeps one entry per Wix or Squarespace media file, `parseSrcset` survives commas inside CDN URLs (GoBoat went from 1 photo to 28), `<picture><source>` and `<link rel=preload as=image>` count as photos, `decodeBody` honours the page's charset, and a bot wall (`BLOCKED_STATUSES` via `HttpError`) returns a message that points at the Send to Image Tools bookmark in the photo tools (`code: "blocked"`, FromWebsite renders the button) and at upload in the Logo tool. Real-site captures live in `__tests__/fixtures/scrape/` with photo-count floors. `extractPhotos` also reads photos shown as CSS backgrounds (inline `style` `url(...)` and lazy-load `data-bg` / `data-background` attributes, `backgroundSource`): truestory.no experience pages have no `<img>` for their gallery at all, 15 carousel photos came back as one (2026-10-22).

**Miss log.** `/api/scrape` sends every miss (an error, 0 or 1-2 photos; the Logo tool only 0 logos, so the client sends `kind`) as one row to the "Image Tools fetch misses" Google Sheet (ID `1KDIEclOLA_LmhqMRfmOr16eV3gjKYVxb-d-BXXQctzw`) via `after()`, so the user never waits on it. The row and its "Paste for Claude" line are built in `lib/scrape-log.ts` (tested); the sheet's Apps Script is `scripts/scrape-log-sheet.gs`. Only sent when `SCRAPE_LOG_URL` / `SCRAPE_LOG_SECRET` are set (Vercel Production only), so localhost never logs. The local scheduled task `image-tools-scrape-fixes` (Mondays 09:00) works through rows with an empty Status, fixes the scraper on a `scrape-fixes/<date>` worktree branch and never pushes. Cloudflare-walled sites (brandstar.se) answer 403 to Vercel but 200 locally: that is a bot wall, not a parser bug.

**Send to Image Tools bookmarklet** (`lib/bookmarklet.ts`, link under the Fetch panel in the photo tools): runs in the user's own browser on sites the server can't read (bot walls, Instagram), opens `/crop?from=bookmarklet` and posts the photos (with bytes where the page may read them) to `components/bookmarklet-receiver.tsx`, which fills the `use-website-import` store that FromWebsite shows. `bookmarkletMain` is stringified, so it must stay self-contained (a test runs it from its source text). A saved bookmark keeps the code it was dragged with: bump `BOOKMARKLET_VERSION` and the `version:` literal inside `bookmarkletMain` whenever that function changes, and FromWebsite tells older bookmarks to be dragged again. Changes anywhere else (the receiver, the tools, the server scraper) need no new bookmark. React blocks `javascript:` hrefs, so the link's href is set through a ref. The in-app browser pane opens pop-ups in the same tab, so test the handshake in a real Chrome.

### Logo background removal

`detectBackground` in `lib/logo-processing.ts` samples 5x5 boxes at the corners of the **opaque** bounding box (not the canvas). For fully opaque images this is the canvas corners. For images with alpha it returns a color only if those corners are mostly opaque and agree on one color; otherwise `color: null`. This catches "transparent" PNG/WebP exports that still carry an opaque white rectangle behind the logo (real-world case: a 300x100 WebP with a 140x90 white box, previously skipped as "already transparent" and returned byte-identical).

`removeBg` uses that color as a soft color key over every pixel (not a flood fill; the old edge fill was redundant because a final pass removed all matching pixels anyway). RGB distance `d` to the background maps to alpha: `d <= 0.6*tolerance` transparent, `d >= 3.2*tolerance` untouched, in between alpha ramps linearly and the background is un-blended from the color (`F = (P - (1-s)*BG) / s`). A hard cut left a whitish fringe of anti-aliased edge pixels on dark surfaces; the ramp plus decontamination gives clean edges. Enclosed areas inside letters (o, b, p) are cleared too, so recolor doesn't fill them. Already-transparent pixels are left alone.

The hook treats an image as "already transparent" (badge, no toggle) only when `hasAlpha && color === null`. It decodes the source and detects the background once, caches the bg-removed canvas per toggle state, and publishes previews as object URLs, so toggling controls never re-scans or base64-encodes the full image.

### Keyboard shortcuts

Handled by `useKeyboardShortcuts` hook. Enter is ignored when focus is on a button, link, select or summary, so keyboard users can press buttons (before, Enter on any focused button triggered the page's download). Cmd/Ctrl + 1-5 switch modes everywhere, the ratio picker included: plain number keys pick cards (`useCardKeys`), and `isPlainShortcut` makes those skip Cmd/Ctrl, so the two never collide. Arrow keys navigate batch queue. Enter downloads. Escape goes back.

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

Defined in `lib/constants.ts` as `RATIOS`: Square (1:1), Experience (3:2), Secondary photo, Cover image (16:10), Free (unconstrained), in that order: number keys 1-5 follow `RATIOS` on the upload cards, the ratio picker and Extend's Target ratio, and the help panel lists them from `RATIOS` (and the modes from `TOOLS`). Experience, Cover image and Secondary photo carry a `slot` and are storefront presets (chosen 2026-10-21; until then 1.4:1 and 54:17, which phones cropped to a 23% slice). Crop, Smart Crop and Extend also have a **Full experience** card (key 4, right after Secondary photo, so Cover image is 5 and Free 6; in Extend it is also a Target ratio button; `uploadCards` sets the order for the cards, the ratio picker via `onPickSet` and the help panel; in the picker it uses pasted or fetched photos in the order they came in): drop up to 4 photos in page order and `experienceSet` (`lib/storefront.ts`) gives photo 1 the Experience shape (role main) and the rest the Secondary shape for their count; each `CropQueueItem` then carries its own `preset`, the hook returns the current photo's ratio, "Make main photo" reorders and re-crops what changed shape, and downloads are named `1-main_…`, `2-secondary_…` (`queueCropFilename`). More than 4 photos: the rest are released with a note. Smart Crop: each `MultiCropItem` carries a `preset` too; analysis reads the item's shape when its result lands (`ratioOf`), so a reorder mid-analysis still crops right; reordering (drag, arrows, "Make main photo" in the editor) reassigns roles by position. All three tools share `assignRoles` (roles by position; only photos whose shape changed are re-cropped, each tool its own way) and `splitSet` (keep 4, the rest plus the note) from `lib/storefront.ts`. Extend: `ExtendQueueItem.preset`, the hook returns the current photo's ratio, and Download all extends each photo at its own shape and safe zone (`extendDownloadPlan`, tested). Number keys on the cards, the ratio picker and Extend's Target ratio go through `useCardKeys`; it and key 7 use `isPlainShortcut` (skips Cmd/Ctrl, typing and the help panel, but not Alt: AltGr on Nordic layouts reports altKey). Card titles come from `cardText`. Every upload screen wraps its drop zones in `FromWebsite` (as `children`): opening the full-width "Fetch from a website" button (key 7, `FETCH_KEY`, the number after the cards, the same in every tool) hides them so only the found images show, with a sticky bar holding the continue button. "Fetch from a website" in those three tools offers **Use full experience** when the URL is an Understory experience page: the scraper's `experiencePhotos` (`experiencePagePhotos`, gallery `<img>` order, main photo first) load straight into Full experience. The scraper unwraps `/_next/image` and `/_vercel/image` URLs, and WordPress's `webpc-passthru.php?src=` (WebP Converter for Media; sherlocked.se, 2026-10-22), to the original (`unwrapOptimizer`, one `OPTIMIZERS` entry per path and query parameter): keyed by path, every optimized photo on a site had collapsed into one, and a logo served the same way then excluded them all. It keeps the optimized URL as `fallbackUrl` (`photoSource`), and `fetchPhoto` (`lib/website-image.ts`) plus the grid's thumbnails fall back to it when an original won't load (over the image proxy's 12 MB cap, for one). Secondary photo is one card that starts at 3 photos (5:3); `SecondaryCountSwitch` (Crop editor header, Smart Crop results grid, Extend header) switches between `SECONDARY_RATIOS` 4:5 / 4:3 / 5:3 for 1 / 2 / 3 secondary photos, all labelled "Secondary photo" so label lookups still find the card. Last selected ratio persisted in localStorage (`image-tools:last-ratio`).

### Storefront safe zone

`lib/storefront.ts` holds where storefronts show images (`STOREFRONT_SLOTS`), measured 2026-10-21 on the Hands & Clay demo storefront and checked three ways: same-origin iframes, real phone/tablet/desktop viewports, and each `<img>`'s `sizes` formula. Every slot is `object-fit: cover` centered, so only the middle is visible everywhere: the safe zone, the overlap of the narrowest and widest box on common devices (phones 360-430px, everything from 768px). The safe area is fixed by the layout (cover 23%, main experience photo 39%, secondary photos 43% / 58% / 38% for 1 / 2 / 3 of them); the crop ratio only changes its shape. The presets stay 3:2 and 16:10 (Filip, 2026-10-21) even though the script's balanced ratios are about 1.60 and 1.87; do not change them to match it. It is drawn (dashed box, the rest dimmed: `SafeZoneBox`) in the crop editor (`CropOverlay` via `safeZoneForRatio`) and the Extend preview, unless the header's Safe zone switch is off (`useSafeZoneVisible`, one setting for all three tools, kept in localStorage; hiding it changes nothing else), keeps Smart Crop subjects inside it (`centeredOnBbox(..., safe)`), drives Extend's "Fit inside safe zone" (`extendGeometry(..., safe)`), and `SizeWarning` flags crops under the slot's `minWidth`; its "Upscale it" sends `enlargeTo: minWidth`, and Upscale picks 2x when that reaches it, else 4x, unless 4x would pass the output cap (`enlargeFactor`). Measurement gotchas: a desktop scrollbar takes 15px and on phone widths adds a horizontal scrollbar under the photo carousel (335px instead of 350px), so measure in device mode, never in iframes. Secondary photos (2-4) share the gallery's right third, one row each (`grid-template-rows: repeat(N, 1fr)` in the gallery's style; photo 5+ only in "See all"), so their tile shape depends on the count: measured on nosworkshop.understory.io (1) and the Hands & Clay demo (2, 3). Re-measure with `scripts/measure-storefront.js` (instructions in its header) when the storefront layout changes.

## UI consistency

Crop and Smart Crop edit views must use the same layout: header row (title + badge + "N of M" + SizeInput), editor, filmstrip with prev/next buttons, action buttons. Keep these consistent when making changes to either mode.
