"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadResult } from "@/lib/download";

/**
 * Busy/error state for download actions. Every page has the same needs: disable buttons
 * while a zip is building, and show a message when an export fails instead of silently
 * doing nothing.
 */
export function useDownload() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async (job: () => Promise<DownloadResult>) => {
    setError(null);
    setBusy(true);
    try {
      const res = await job();
      if (mounted.current && res.error) setError(res.error);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error && err.message ? err.message : "Download failed.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  return { busy, error, run, clearError: () => setError(null) };
}
