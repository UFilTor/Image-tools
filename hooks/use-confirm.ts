"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseConfirmOptions {
  onConfirm: () => void;
  /** How many items would be wiped — used with `threshold` to skip confirm when below. */
  count?: number;
  /** Skip confirm when count < threshold. Default: 1 (always confirm). */
  threshold?: number;
  /** How long the armed state stays hot, ms. Default 2500. */
  armMs?: number;
}

export function useConfirm({ onConfirm, count = 1, threshold = 1, armMs = 2500 }: UseConfirmOptions) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const fire = useCallback(() => {
    if (count < threshold) {
      onConfirm();
      return;
    }
    if (armed) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setArmed(false), armMs);
  }, [armed, count, threshold, armMs, onConfirm]);

  const cancel = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setArmed(false);
  }, []);

  return { armed, fire, cancel };
}
