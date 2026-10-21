"use client";

import { useCallback, useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@/lib/constants";

// One setting for Crop, Smart Crop and Extend, so hiding the safe zone in one tool hides it in
// all of them. Remembered in this browser; `memory` keeps the toggle working only when storage is blocked.
let memory: boolean | null = null;
const listeners = new Set<() => void>();

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};

const read = (): boolean => {
  if (memory !== null) return memory;
  try {
    return localStorage.getItem(STORAGE_KEYS.safeZoneHidden) !== "1";
  } catch {
    return true;
  }
};

/** Whether the storefront safe zone is drawn (on by default), and a setter shared by every tool. */
export function useSafeZoneVisible(): [boolean, (visible: boolean) => void] {
  // The server always sees "on", so hydration matches; the saved choice applies right after.
  const visible = useSyncExternalStore(subscribe, read, () => true);
  const setVisible = useCallback((next: boolean) => {
    try {
      if (next) localStorage.removeItem(STORAGE_KEYS.safeZoneHidden);
      else localStorage.setItem(STORAGE_KEYS.safeZoneHidden, "1");
      memory = null; // storage works: read it, so other tabs' changes come through
    } catch {
      memory = next;
    }
    listeners.forEach((l) => l());
  }, []);
  return [visible, setVisible];
}
