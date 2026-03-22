"use client";

import { CropRect, CropDragType } from "@/lib/types";

interface CropOverlayProps {
  crop: CropRect;
  onDown: (e: React.MouseEvent, type: CropDragType) => void;
}

function Handle({
  style,
  type,
  cursor,
  onDown,
  hw = 12,
  hh = 12,
}: {
  style: React.CSSProperties;
  type: CropDragType;
  cursor: string;
  onDown: (e: React.MouseEvent, type: CropDragType) => void;
  hw?: number;
  hh?: number;
}) {
  return (
    <div
      onMouseDown={(e) => onDown(e, type)}
      className="absolute bg-white rounded-[3px] shadow-md z-10"
      style={{ width: hw, height: hh, cursor, ...style }}
    />
  );
}

export function CropOverlay({ crop, onDown }: CropOverlayProps) {
  const { x, y, w, h } = crop;

  return (
    <>
      {/* Dimmed overlay regions */}
      {[
        { top: 0, left: 0, right: 0, height: y },
        { top: y + h, left: 0, right: 0, bottom: 0 },
        { top: y, left: 0, width: x, height: h },
        { top: y, left: x + w, right: 0, height: h },
      ].map((s, i) => (
        <div
          key={i}
          className="absolute bg-white/65 pointer-events-none"
          style={s}
        />
      ))}

      {/* Crop rectangle */}
      <div
        onMouseDown={(e) => onDown(e, "move")}
        className="absolute border-2 border-primary/85 cursor-grab z-5"
        style={{
          left: x, top: y, width: w, height: h,
          boxSizing: "border-box",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(0,0,0,0.08)",
        }}
      >
        {/* Rule of thirds grid */}
        {[1, 2].map((i) => [
          <div key={`v${i}`} className="absolute top-0 bottom-0 w-px bg-primary/20 pointer-events-none" style={{ left: `${i * 33.33}%` }} />,
          <div key={`h${i}`} className="absolute left-0 right-0 h-px bg-primary/20 pointer-events-none" style={{ top: `${i * 33.33}%` }} />,
        ])}

        {/* Corner handles */}
        <Handle style={{ top: -6, left: -6 }} type="tl" cursor="nwse-resize" onDown={onDown} />
        <Handle style={{ top: -6, right: -6 }} type="tr" cursor="nesw-resize" onDown={onDown} />
        <Handle style={{ bottom: -6, left: -6 }} type="bl" cursor="nesw-resize" onDown={onDown} />
        <Handle style={{ bottom: -6, right: -6 }} type="br" cursor="nwse-resize" onDown={onDown} />

        {/* Edge handles */}
        <Handle style={{ top: "50%", left: -5, transform: "translateY(-50%)" }} type="l" cursor="ew-resize" onDown={onDown} hw={10} hh={28} />
        <Handle style={{ top: "50%", right: -5, transform: "translateY(-50%)" }} type="r" cursor="ew-resize" onDown={onDown} hw={10} hh={28} />
        <Handle style={{ left: "50%", top: -5, transform: "translateX(-50%)" }} type="t" cursor="ns-resize" onDown={onDown} hw={28} hh={10} />
        <Handle style={{ left: "50%", bottom: -5, transform: "translateX(-50%)" }} type="b" cursor="ns-resize" onDown={onDown} hw={28} hh={10} />
      </div>
    </>
  );
}
