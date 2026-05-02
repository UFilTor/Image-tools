"use client";

import { useRef, useState, ReactNode } from "react";
import { isAcceptedFile, MAX_FILE_SIZE } from "@/lib/constants";
import { convertHeicFiles, isHeicFile } from "@/lib/heic-convert";
import { getPasteShortcut } from "@/lib/platform";

interface DropZoneProps {
  onFiles: (files: FileList) => void;
  multiple?: boolean;
  children: (over: boolean) => ReactNode;
}

export function DropZone({ onFiles, multiple = false, children }: DropZoneProps) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = (files: FileList): FileList | null => {
    setError(null);
    for (const file of Array.from(files)) {
      if (!isAcceptedFile(file)) {
        setError(`Unsupported format: ${file.name}. Use PNG, JPG, WebP, or HEIC.`);
        return null;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} exceeds 20MB limit.`);
        return null;
      }
    }
    return files;
  };

  const processFiles = async (files: FileList) => {
    const valid = validate(files);
    if (!valid) return;

    const arr = Array.from(valid);
    if (arr.some(isHeicFile)) {
      setConverting(true);
      try {
        const converted = await convertHeicFiles(arr);
        onFiles(converted);
      } catch {
        setError("Failed to convert HEIC file. Try converting it to JPG first.");
      } finally {
        setConverting(false);
      }
    } else {
      onFiles(valid);
    }
  };

  return (
    <div>
      <button
        type="button"
        aria-label="Upload image — click to browse, drop to upload, or paste from clipboard"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          processFiles(e.dataTransfer.files);
        }}
        onClick={() => !converting && inputRef.current?.click()}
        disabled={converting}
        className={`
          w-full block border-2 border-dashed rounded-2xl py-[68px] px-12 cursor-pointer
          text-center transition-[background-color,border-color] duration-200
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg
          disabled:cursor-not-allowed
          ${over ? "border-primary bg-primary-bg" : "border-border bg-surface"}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) processFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {converting ? (
          <div className="text-sm text-text-muted animate-pulse">Converting HEIC...</div>
        ) : (
          <>
            {children(over)}
            <div className="hidden sm:block text-[10px] text-text-muted mt-2">
              or paste with {getPasteShortcut()}
            </div>
          </>
        )}
      </button>
      {error && (
        <p className="mt-3 text-sm text-error font-medium text-center">{error}</p>
      )}
    </div>
  );
}
