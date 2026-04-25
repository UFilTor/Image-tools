"use client";

import { CropQueueItem } from "@/lib/types";

interface ImageFilmstripProps {
  items: CropQueueItem[];
  currentIdx: number;
  onSelect: (idx: number) => void;
}

export function ImageFilmstrip({ items, currentIdx, onSelect }: ImageFilmstripProps) {
  if (items.length <= 1) return null;

  return (
    <div className="flex gap-2 overflow-x-auto py-1.5 px-1 max-w-full">
      {items.map((item, idx) => (
        <button
          key={idx}
          onClick={() => onSelect(idx)}
          className={`
            shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 cursor-pointer
            transition-all duration-150 bg-surface-alt
            ${idx === currentIdx
              ? "border-primary shadow-md"
              : item.adjusted
                ? "border-primary-muted/60"
                : "border-border"
            }
          `}
        >
          <img
            src={item.src}
            className="w-full h-full object-cover"
            draggable={false}
          />
        </button>
      ))}
    </div>
  );
}
