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
