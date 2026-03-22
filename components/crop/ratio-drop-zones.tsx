"use client";

import { useRef, useState } from "react";
import { RATIOS, ACCEPTED_TYPES, MAX_FILE_SIZE } from "@/lib/constants";

interface RatioDropZonesProps {
  onDropWithRatio: (files: FileList, ratioValue: number | null, ratioLabel: string) => void;
  onBrowse: (files: FileList) => void;
}

export function RatioDropZones({ onDropWithRatio, onBrowse }: RatioDropZonesProps) {
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const clickedRatioRef = useRef<{ value: number | null; label: string } | null>(null);
  const ratioInputRef = useRef<HTMLInputElement>(null);

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

  const handleCardClick = (value: number | null, label: string) => {
    clickedRatioRef.current = { value, label };
    ratioInputRef.current?.click();
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 max-w-[480px] mx-auto">
        {RATIOS.map(({ label, sub, value }, idx) => (
          <div
            key={label}
            onClick={() => handleCardClick(value, label)}
            onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
            onDragLeave={() => setOverIdx(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOverIdx(null);
              const valid = validate(e.dataTransfer.files);
              if (valid) onDropWithRatio(valid, value, label);
            }}
            className={`
              border-2 border-dashed rounded-2xl py-10 px-6 cursor-pointer
              text-center transition-all duration-200 flex flex-col items-center gap-2
              hover:border-primary hover:bg-primary-bg
              ${overIdx === idx ? "border-primary bg-primary-bg" : "border-border bg-surface"}
            `}
          >
            <span className={`text-[15px] font-bold ${overIdx === idx ? "text-primary" : "text-text"}`}>
              {label}
            </span>
            <span className={`text-[11px] font-medium ${overIdx === idx ? "text-primary-muted" : "text-text-muted"}`}>
              {sub}
            </span>
            <span className="text-[10px] text-text-dim mt-1">
              Click or drop image here
            </span>
          </div>
        ))}
      </div>
      {/* Hidden file input for ratio card clicks */}
      <input
        ref={ratioInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && clickedRatioRef.current) {
            const valid = validate(e.target.files);
            if (valid) {
              onDropWithRatio(valid, clickedRatioRef.current.value, clickedRatioRef.current.label);
            }
          }
          clickedRatioRef.current = null;
          e.target.value = "";
        }}
      />
      <div className="text-center mt-6">
        <button
          onClick={() => inputRef.current?.click()}
          className="text-[13px] text-primary font-semibold cursor-pointer bg-transparent border-none hover:underline"
        >
          or browse files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              const valid = validate(e.target.files);
              if (valid) onBrowse(valid);
            }
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p className="mt-3 text-sm text-error font-medium text-center">{error}</p>
      )}
    </div>
  );
}
