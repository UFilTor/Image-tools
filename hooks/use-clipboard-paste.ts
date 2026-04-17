"use client";

import { useEffect } from "react";
import { isAcceptedFile, MAX_FILE_SIZE } from "@/lib/constants";
import { convertHeicFiles, isHeicFile } from "@/lib/heic-convert";

export function useClipboardPaste(onFiles: ((files: FileList) => void) | null) {
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
          if (file && isAcceptedFile(file) && file.size <= MAX_FILE_SIZE) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        if (imageFiles.some(isHeicFile)) {
          convertHeicFiles(imageFiles).then(onFiles).catch(() => {});
        } else {
          const dt = new DataTransfer();
          imageFiles.forEach((f) => dt.items.add(f));
          onFiles(dt.files);
        }
      }
    };

    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [onFiles]);
}
