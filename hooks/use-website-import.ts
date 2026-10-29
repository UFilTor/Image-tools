"use client";

import { useSyncExternalStore } from "react";
import type { ImageCandidate } from "@/lib/brand-scrape/types";

/** A found photo; `localUrl` is an object URL when the bookmarklet sent its bytes, so no proxy fetch is needed. */
export interface FoundPhoto extends ImageCandidate {
  localUrl?: string;
}

export interface WebsiteImport {
  site: string;
  items: FoundPhoto[];
  /** Sent by a bookmark dragged before the current BOOKMARKLET_VERSION: FromWebsite asks for a new drag. */
  outdated: boolean;
}

// Photos the "Send to Image Tools" bookmarklet delivered (components/bookmarklet-receiver.tsx).
// Module-level, like the tool hooks' state, so every photo tool's FromWebsite offers the same set.
let current: WebsiteImport | null = null;
const listeners = new Set<() => void>();

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Replace the delivered set, releasing the previous set's object URLs. */
export function setWebsiteImport(next: WebsiteImport | null) {
  for (const item of current?.items ?? []) if (item.localUrl) URL.revokeObjectURL(item.localUrl);
  current = next;
  listeners.forEach((l) => l());
}

/** The photos the bookmarklet delivered, or null. */
export function useWebsiteImport(): WebsiteImport | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
