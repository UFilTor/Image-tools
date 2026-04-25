"use client";

import { useRef, useState } from "react";
import { RATIOS, isAcceptedFile, MAX_FILE_SIZE } from "@/lib/constants";
import { convertHeicFiles, isHeicFile } from "@/lib/heic-convert";
import { KeyboardHint } from "@/components/ui/keyboard-hint";

interface RatioDropZonesProps {
  onDropWithRatio: (files: FileList, ratioValue: number | null, ratioLabel: string) => void;
}

export function RatioDropZones({ onDropWithRatio }: RatioDropZonesProps) {
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const clickedRatioRef = useRef<{ value: number | null; label: string } | null>(null);
  const ratioInputRef = useRef<HTMLInputElement>(null);

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

  const processFiles = async (files: FileList, ratioValue: number | null, ratioLabel: string) => {
    const valid = validate(files);
    if (!valid) return;

    const arr = Array.from(valid);
    if (arr.some(isHeicFile)) {
      setConverting(true);
      try {
        const converted = await convertHeicFiles(arr);
        onDropWithRatio(converted, ratioValue, ratioLabel);
      } catch {
        setError("Failed to convert HEIC file. Try converting it to JPG first.");
      } finally {
        setConverting(false);
      }
    } else {
      onDropWithRatio(valid, ratioValue, ratioLabel);
    }
  };

  const handleCardClick = (value: number | null, label: string) => {
    if (converting) return;
    clickedRatioRef.current = { value, label };
    ratioInputRef.current?.click();
  };

  return (
    <div>
      {converting && (
        <div className="text-sm text-text-muted animate-pulse text-center mb-3">Converting HEIC...</div>
      )}
      <div className="grid grid-cols-2 gap-3 max-w-[480px] mx-auto">
        {RATIOS.map(({ label, sub, value }, idx) => {
          const isOver = overIdx === idx;
          return (
            <div
              key={label}
              onClick={() => handleCardClick(value, label)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
              onDragLeave={() => setOverIdx(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOverIdx(null);
                processFiles(e.dataTransfer.files, value, label);
              }}
              className={`
                relative border-2 border-dashed rounded-2xl pt-9 pb-5 px-5 cursor-pointer
                text-center transition-all duration-200 flex flex-col items-center gap-1.5
                hover:border-primary hover:bg-primary-bg
                ${isOver ? "border-primary bg-primary-bg" : "border-border bg-surface"}
              `}
            >
              <span className="absolute top-2.5 right-2.5">
                <KeyboardHint shortcut={String(idx + 1)} />
              </span>
              <span className="font-display uppercase font-bold text-[18px] text-primary tracking-[0.02em] leading-none">
                {label}
              </span>
              <span className="text-[12px] font-medium tracking-[0.04em] text-text-muted">
                {sub}
              </span>
              <span className="text-[10px] text-text-dim mt-1">
                Click or drop image here
              </span>
            </div>
          );
        })}
      </div>
      <input
        ref={ratioInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && clickedRatioRef.current) {
            processFiles(e.target.files, clickedRatioRef.current.value, clickedRatioRef.current.label);
          }
          clickedRatioRef.current = null;
          e.target.value = "";
        }}
      />
      {error && (
        <p className="mt-3 text-sm text-error font-medium text-center">{error}</p>
      )}
    </div>
  );
}
