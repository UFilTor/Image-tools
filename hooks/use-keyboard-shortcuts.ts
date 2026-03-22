"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SHORTCUT_MAP } from "@/lib/constants";

interface ShortcutActions {
  onEnter?: () => void;
  onEscape?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  /** When true, disables global 1-3 mode navigation (e.g., when RatioPicker is active) */
  disableModeNav?: boolean;
}

export function useKeyboardShortcuts(actions: ShortcutActions = {}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when input is focused
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Number keys — mode navigation (disabled when ratio picker is active)
      if (!actions.disableModeNav) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 3) {
          e.preventDefault();
          router.push(`/${SHORTCUT_MAP.modes[num - 1]}`);
          return;
        }
      }

      if (e.key === "Enter" && actions.onEnter) {
        e.preventDefault();
        actions.onEnter();
        return;
      }

      if (e.key === "Escape" && actions.onEscape) {
        e.preventDefault();
        actions.onEscape();
        return;
      }

      if (e.key === "ArrowLeft" && actions.onLeft) {
        e.preventDefault();
        actions.onLeft();
        return;
      }

      if (e.key === "ArrowRight" && actions.onRight) {
        e.preventDefault();
        actions.onRight();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, pathname, actions]);
}
