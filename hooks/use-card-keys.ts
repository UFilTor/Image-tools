"use client";

import { useEffect, useRef } from "react";
import { isPlainShortcut } from "@/lib/keyboard";

/**
 * Number keys 1, 2, … pick `items[n - 1]`: the upload cards, the ratio picker and Extend's Target
 * ratio share this, so they skip the same keys (see isPlainShortcut).
 */
export function useCardKeys<T>(items: readonly T[], onPick: (item: T) => void, enabled = true): void {
  // The listener is attached once per `items`; it always calls the latest onPick.
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  });

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (!isPlainShortcut(e)) return;
      const item = items[parseInt(e.key, 10) - 1];
      if (item === undefined) return;
      e.preventDefault();
      onPickRef.current(item);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items, enabled]);
}
