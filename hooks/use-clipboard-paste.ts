"use client";

import { useEffect } from "react";
import { ACCEPTED_TYPES, MAX_FILE_SIZE } from "@/lib/constants";

export function useClipboardPaste(onFiles: ((files: FileList) => void) | null) {
  useEffect(() => {
    if (!onFiles) return;

    const handler = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file && ACCEPTED_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        const dt = new DataTransfer();
        imageFiles.forEach((f) => dt.items.add(f));
        onFiles(dt.files);
      }
    };

    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [onFiles]);
}
