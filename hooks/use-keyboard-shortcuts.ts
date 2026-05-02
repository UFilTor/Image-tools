"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
  const actionsRef = useRef(actions);

  // Mirror latest actions into the ref (no setState, no effect dependency churn).
  useEffect(() => {
    actionsRef.current = actions;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const a = actionsRef.current;

      if (!a.disableModeNav && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 3) {
          e.preventDefault();
          router.push(`/${SHORTCUT_MAP.modes[num - 1]}`);
          return;
        }
      }

      if (e.key === "Enter" && a.onEnter) {
        e.preventDefault();
        a.onEnter();
        return;
      }

      if (e.key === "Escape" && a.onEscape) {
        e.preventDefault();
        a.onEscape();
        return;
      }

      if (e.key === "ArrowLeft" && a.onLeft) {
        e.preventDefault();
        a.onLeft();
        return;
      }

      if (e.key === "ArrowRight" && a.onRight) {
        e.preventDefault();
        a.onRight();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);
}
