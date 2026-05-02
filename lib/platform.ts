"use client";

import { useSyncExternalStore } from "react";

/**
 * Detect Mac vs other platforms for keyboard shortcut display.
 * Returns "⌘" on Mac, "Ctrl+" elsewhere. Safe on the server (returns "Ctrl+").
 */
export function getModKey(): string {
  if (typeof navigator === "undefined") return "Ctrl+";
  return navigator.platform?.toLowerCase().includes("mac") ? "⌘" : "Ctrl+";
}

export function getPasteShortcut(): string {
  if (typeof navigator === "undefined") return "Ctrl+V";
  return navigator.platform?.toLowerCase().includes("mac") ? "Cmd+V" : "Ctrl+V";
}

const noopSubscribe = () => () => {};

/**
 * Returns the platform-correct mod key after hydration. Returns null on the
 * server and during the first client render so SSR markup stays stable
 * (no Ctrl→⌘ flash on Mac).
 */
export function useModKey(): string | null {
  return useSyncExternalStore(noopSubscribe, getModKey, () => null);
}
