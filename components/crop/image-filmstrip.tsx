"use client";

interface FilmstripItem {
  src: string;
  adjusted?: boolean;
  /** Short label over the thumbnail, such as "Main" */
  tag?: string;
}

interface ImageFilmstripProps {
  items: FilmstripItem[];
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
            relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 cursor-pointer
            transition-[border-color,box-shadow] duration-150 bg-surface-alt
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
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            draggable={false}
          />
          {item.tag && (
            <span className="absolute left-0.5 bottom-0.5 px-1 py-0.5 rounded text-[9px] font-semibold leading-none text-white bg-black/65">
              {item.tag}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
