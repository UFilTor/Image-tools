/**
 * Tiny shared flag so page-level keyboard shortcuts know when an overlay (help panel)
 * owns the keyboard. Listener registration order on `window` is not controllable across
 * components, so stopPropagation alone can't prevent Escape from firing twice.
 *
 * TODO(simplification): module-global counter. Ceiling: an overlay that unmounts without
 * running its cleanup leaves the count stuck and disables page shortcuts until reload.
 * Upgrade path: one keyboard dispatcher (context + scope stack) owning the single window listener.
 */
let openCount = 0;

export function setOverlayOpen(open: boolean): void {
  openCount = Math.max(0, openCount + (open ? 1 : -1));
}

export function isOverlayOpen(): boolean {
  return openCount > 0;
}
