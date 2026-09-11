"use client";

import { useEffect, useRef } from "react";
import { isAcceptedFile } from "@/lib/constants";
import { prepareFiles } from "@/lib/file-intake";

/**
 * Global paste-to-upload. Active only while `onFiles` is non-null (upload steps).
 * `onError` receives validation/conversion problems so a failed paste isn't silent.
 */
export function useClipboardPaste(onFiles: ((files: FileList) => void) | null, onError?: (msg: string) => void) {
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!onFiles) return;

    const handler = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file && isAcceptedFile(file)) imageFiles.push(file);
        }
      }
      if (!imageFiles.length) return;

      e.preventDefault();
      prepareFiles(imageFiles).then(({ files, error }) => {
        if (error) onErrorRef.current?.(error);
        if (files) onFiles(files);
      });
    };

    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [onFiles]);
}
