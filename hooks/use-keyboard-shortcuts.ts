"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SHORTCUT_MAP } from "@/lib/constants";
import { isOverlayOpen } from "@/lib/overlay-state";
import { isControlTarget } from "@/lib/keyboard";

interface ShortcutActions {
  onEnter?: () => void;
  onEscape?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
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
      // An open overlay (help panel) owns Enter/Escape/arrows; mode switching still works.
      const overlayOpen = isOverlayOpen();

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= SHORTCUT_MAP.modes.length) {
          e.preventDefault();
          router.push(`/${SHORTCUT_MAP.modes[num - 1]}`);
          return;
        }
      }

      if (overlayOpen) return;

      // Enter on a focused button, link or select belongs to that control (keyboard users press
      // buttons with Enter); only a "free" Enter triggers the page action.
      if (e.key === "Enter" && a.onEnter && !isControlTarget(e.target)) {
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
