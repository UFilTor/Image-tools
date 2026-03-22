"use client";

import { useRef, useState, ReactNode } from "react";
import { ACCEPTED_TYPES, MAX_FILE_SIZE } from "@/lib/constants";

function getPasteShortcut(): string {
  if (typeof navigator !== "undefined" && navigator.platform?.toLowerCase().includes("mac")) {
    return "Cmd+V";
  }
  return "Ctrl+V";
}

interface DropZoneProps {
  onFiles: (files: FileList) => void;
  multiple?: boolean;
  children: (over: boolean) => ReactNode;
}

export function DropZone({ onFiles, multiple = false, children }: DropZoneProps) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = (files: FileList): FileList | null => {
    setError(null);
    for (const file of Array.from(files)) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(`Unsupported format: ${file.name}. Use PNG, JPG, or WebP.`);
        return null;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} exceeds 20MB limit.`);
        return null;
      }
    }
    return files;
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const valid = validate(e.dataTransfer.files);
          if (valid) onFiles(valid);
        }}
        onClick={() => inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-2xl py-14 px-12 cursor-pointer
          text-center transition-all duration-200
          ${over ? "border-primary bg-primary-bg" : "border-border bg-surface"}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              const valid = validate(e.target.files);
              if (valid) onFiles(valid);
            }
            e.target.value = "";
          }}
        />
        {children(over)}
        <div className="text-[10px] text-text-dim mt-2">
          or paste with {getPasteShortcut()}
        </div>
      </div>
      {error && (
        <p className="mt-3 text-sm text-error font-medium text-center">{error}</p>
      )}
    </div>
  );
}
