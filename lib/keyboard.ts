import { isOverlayOpen } from "./overlay-state";

/**
 * True when a key event comes from a control that handles Enter itself (button, link, select,
 * summary, role=button, contenteditable), including an element inside one. The page-wide Enter
 * shortcut skips these, so keyboard users can press buttons with Enter.
 */
export function isControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest("button, a[href], select, summary, [role='button'], [contenteditable='true']")
  );
}

/**
 * A key the page's shortcuts may act on: not held with Cmd or Ctrl (those are browser and mode
 * shortcuts), not typed into a field, and the help panel isn't open. Alt and Shift are allowed:
 * on Nordic layouts AltGr reports altKey for characters like { and [, and a number key with Shift
 * or AltGr arrives as another character anyway, so it never matches a digit.
 */
export function isPlainShortcut(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey) return false;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return false;
  return !isOverlayOpen();
}
