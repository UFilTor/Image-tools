# QA Report — Understory Image Tools

**Date:** 2026-05-02
**Base URL:** http://localhost:3001
**Manifest:** 3 screens (`/crop`, `/smart-crop`, `/logo`)
**Agents:** smoke-tester, ux-auditor, mobile-ux-auditor, performance-profiler, adversarial-breaker

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 2 |
| Medium | 6 |
| Low | 8 |
| Pass | many |

## Coverage

| Screen | Smoke | UX (X/75) | Mobile (X/56) | Perf (X/13) | Adversarial |
|---|---|---|---|---|---|
| /crop | ✓ Pass | 56/75 (1 MAJOR x-mode) | 47/56 | 11/13 | 1 high, 2 med |
| /smart-crop | ✓ Pass | 56/75 (3 MAJOR x-mode) | 47/56 | 11/13 | 1 high, 2 med |
| /logo | ✓ Pass | 56/75 (1 MAJOR x-mode) | 47/56 | 11/13 | 1 med |
| Help panel (`?`) | ✓ Pass | — | — | — | — |

UX, Mobile, and Perf scores are app-wide aggregates — the three screens share chrome and grades match within ±2.

## Findings by Severity

### High

1. **[Adversarial] Empty / corrupt file = silent dead-end.** Drop a 0-byte or invalid PNG onto any ratio card or DropZone — `img.onload` never fires, page sits forever with no error, no spinner. Affects all three modes. Hooks: `use-single-crop`, `use-multi-crop`, `use-logo-processor`.
2. **[Adversarial] Mixed valid+corrupt batch loses the entire batch.** One bad file in a 50-image drop blocks the whole batch from committing because the `done === arr.length` aggregator never reaches its target on `img.onerror`.

### Medium

3. **[UX cross-mode] Action button sizes inconsistent.** Smart Crop review uses `size="sm"`; Crop and Logo editors use `size="md"`. Violates CLAUDE.md's "UI consistency across modes" rule.
4. **[UX cross-mode] Reset label trio.** "New images" / "New batch" / "New logo" — same idiom, three labels. Pick one pattern.
5. **[UX cross-mode] Confirm prompt template mismatch.** "Clear N images?" vs "Clear current logo?" — different shapes for the same action.
6. **[Adversarial] `runAnalysis` race.** Changing ratio mid-analysis spawns a concurrent loop; both race on `setItems[idx]`. No AbortController, no generation token. State flickers; could overwrite manual crop edits.
7. **[Adversarial] Double-click Retry races.** `retryItem` has no re-entry guard; rapid clicks queue duplicate `detectFocalWithFallback` calls.
8. **[Perf] `fadeUp` animates `filter: blur(4px)`.** Paint-bound, not compositor-only. Allocates offscreen layer for 420ms on every mount. Will spike TBT in long batches.

### Low

9. **[UX] "Logo Processor" h1 vs "Logo" nav.** Drop "Processor" — align with "Crop" / "Smart Crop".
10. **[UX] DropZone copy inconsistent.** Logo says "Drop logo here or browse" + "PNG, JPG, or WebP"; Crop/Smart Crop ratio cards say "Click or drop image" with no format list. Logo's format list is also wrong (HEIC works but isn't advertised).
11. **[UX] Subtitle voice differs across modes.** Three different sentence shapes/tenses for the three mode hero subheads.
12. **[UX] SSR hydration flash on Mac.** Nav renders `Ctrl+1` then swaps to `⌘1` on mount. Visible flicker.
13. **[UX] Confirm sr-only message says "Press again to confirm"** while button shows "Clear current logo?" — screen-reader instruction doesn't match visible label.
14. **[Mobile] Nav tab height 36px** (below iOS 44px HIG).
15. **[Mobile] Cmd+V paste hint visible at <sm.** Mobile has no Cmd key.
16. **[Mobile] ⌘1/⌘2/⌘3 kbd badges visible at <sm.** Irrelevant without hardware keyboard.
17. **[Adversarial] `removeBg` undefined on tiny logos (<5×5).** Sample loop indexes out-of-bounds; output silently broken.
18. **[Adversarial] SizeInput silently rejects values <10.** No feedback to user.
19. **[Perf] `transition-all` in `logo-controls.tsx`.** Replace with explicit property list.
20. **[Perf] Raw `<img>` instead of `next/image`.** Justified for blob URLs, but ensure explicit width/height to lock layout.
21. **[Adversarial] Cmd+1/2/3 still works mid-HEIC-conversion.** User can navigate away while the convert promise is in-flight.

## Smoke Test Results

| Screen | Load | Content | Console | Status |
|---|---|---|---|---|
| /crop | 200 | ratio cards rendered | 0 errors | ✓ |
| /smart-crop | 200 | "AI finds focal points" subtitle + ratio cards | 0 errors | ✓ |
| /logo | 200 | dropzone + paste hint | 0 errors | ✓ |
| Help (`?`) | — | dialog opens, Esc closes | 0 errors | ✓ |

5/5 pass.

## UX Audit Results — 56/75

| Tier | Pass/Total |
|---|---|
| Deterministic | 24/30 |
| Heuristic | 22/30 |
| LLM-Assisted | 10/15 |

Strongest categories: Component States (8/8), Layout (6/6), Visual Complexity (11/12). Weakest: Visual Consistency on Smart Crop (4/7) due to cross-mode mismatches; Copy & Microcopy across all three (5/7).

**Cross-screen wins:**
- Confirm-arm pattern is uniformly correct (same component, aria-pressed, sr-only, danger variant transition).
- Drop-zone hover treatment identical across modes.
- Brand tokens used consistently (Oswald, Inter, primary/accent/border).

**Cross-screen losses:**
- Action button sizes (sm vs md), reset labels, confirm prompts, mode-tab shortcut visibility, "Change ratio" button icon presence — every one of these is a small CLAUDE.md "UI consistency" violation.

## Mobile UX Audit Results — 47/56

| Tier | Pass/Total |
|---|---|
| Deterministic | 32/35 |
| Heuristic | 12/14 |
| LLM-Assisted | 3/7 |

All three landing screens audited. Editing surfaces (filmstrip, crop overlay, drag handles, SizeInput) not exercised — would need an uploaded fixture. Strongest: Mobile Typography (10/10 on all), iOS Safari Specific (5/5), Accessibility (6/6). Weakest: Touch & Interaction (6/7) due to nav tab height.

No horizontal scroll. Header collapses correctly to column-flex on `<sm`. The "Hover to compare" hint is correctly hidden on mobile.

## Performance Results — 11/13

All measurements from `next dev` + Turbopack on localhost:3001 — production bundle will be substantially smaller (decoded JS ~5–10× smaller).

### Per-route Web Vitals

| Route | TTFB | FCP | LCP | CLS | TBT | DOM nodes |
|---|---|---|---|---|---|---|
| /crop | 24 ms | 324 ms | 1048 ms (cold) | 0.000 | 0 ms | 91 |
| /smart-crop | 42 ms | 104 ms | 120 ms | 0.000 | 0 ms | 91 |
| /logo | 32 ms | 84 ms | 208 ms | 0.000 | 0 ms | 76 |

All Core Web Vitals "Good." Crop's higher LCP is cold-compile artifact in dev mode.

### Pass

TTFB, FCP, LCP, CLS, TBT, DOM nodes, no 3rd-party blocking, heic2any lazy-loaded, prefers-reduced-motion honored, hooks memoized, no analytics on cold path.

### Fail

`fadeUp` filter blur (paint-bound) and raw `<img>` for static assets (justified for blobs, but check Understory wordmark / sample assets if any).

## Adversarial Results

**2 High, 4 Medium, 4 Low.** No console errors during any attack. The killer issues are file-handling: corrupt/empty PNGs leave the app in a permanent stuck state, and a single bad file in a batch wipes the whole batch. After that, two race conditions in Smart Crop's analysis state machine that don't crash but can corrupt user-edited crops in unlikely sequences.

Tested and passed: keyboard hammering during edit, Cmd+1/2/3 navigation, 21 MB file rejection, confirm arm/fire double-click, 1×1 PNG through Smart Crop.

## Recommended fix order

1. **High-1 + High-2 (file handling).** Wire `img.onerror` and reject `file.size === 0` in `validate()`. Single change in `DropZone` + matching change in each load hook. ~30 minutes.
2. **Medium-3, -4, -5 (UX cross-mode consistency).** Standardize size, label, and confirm template. Likely a small `<ResetButton noun count />` extraction. ~45 minutes.
3. **Medium-6, -7 (Smart Crop races).** Generation token in `useMultiCrop` + re-entry guard in `retryItem`. ~30 minutes.
4. **Medium-8 (perf blur).** Drop `filter: blur` from `fadeUp` keyframe. ~5 minutes.
5. **Low-12 (hydration flash).** `suppressHydrationWarning` on the kbd hints, render neutral placeholder server-side. ~15 minutes.
6. **Low-14, -15, -16 (mobile chrome polish).** Hide Cmd+V hint and ⌘ kbd badges below sm; bump nav tab height. ~10 minutes.
7. Everything else as time allows.

Total estimated: ~2.5 hours of focused work to clear High + Medium.
