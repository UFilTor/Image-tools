"use client";

import { useEffect, useRef } from "react";

/** Call `onResize` (debounced) when the viewport size changes. The callback always sees the latest closure. */
export function useWindowResize(onResize: () => void, delayMs = 150) {
  const cbRef = useRef(onResize);
  useEffect(() => {
    cbRef.current = onResize;
  });
  useEffect(() => {
    let timer: number | null = null;
    const handler = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => cbRef.current(), delayMs);
    };
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("resize", handler);
      if (timer) window.clearTimeout(timer);
    };
  }, [delayMs]);
}
