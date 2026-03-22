"use client";

import { useEffect, useRef } from "react";
import { CropRect, CropDragType } from "@/lib/types";
import { clamp } from "@/lib/crop-math";

interface DragState {
  type: CropDragType;
  sx: number;
  sy: number;
  sc: CropRect;
  r: number | null;
  dw: number;
  dh: number;
  set: (c: CropRect) => void;
  zoom: number;
}

export function useCropDrag() {
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.sx) / d.zoom;
      const dy = (e.clientY - d.sy) / d.zoom;
      const { type, sc, r, dw, dh, set } = d;
      const c = { ...sc };

      if (type === "move") {
        c.x = sc.x + dx;
        c.y = sc.y + dy;
      } else if (r === null) {
        // Free ratio: width and height resize independently
        const isL = ["tl", "l", "bl"].includes(type);
        const isR = ["tr", "r", "br"].includes(type);
        const isT = ["tl", "t", "tr"].includes(type);
        const isB = ["bl", "b", "br"].includes(type);

        let nw = sc.w;
        let nh = sc.h;

        if (isL) { nw = sc.w - dx; c.x = sc.x + dx; }
        else if (isR) { nw = sc.w + dx; }

        if (isT) { nh = sc.h - dy; c.y = sc.y + dy; }
        else if (isB) { nh = sc.h + dy; }

        nw = Math.max(60, nw);
        nh = Math.max(60, nh);

        if (isL) { c.x = sc.x + sc.w - nw; }
        if (isT) { c.y = sc.y + sc.h - nh; }

        c.w = nw;
        c.h = nh;
      } else {
        // Fixed ratio
        const isL = ["tl", "l", "bl"].includes(type);
        const isT = ["tl", "t", "tr"].includes(type);
        let nw = isL
          ? sc.w - dx
          : ["tr", "r", "br"].includes(type)
            ? sc.w + dx
            : type === "t"
              ? (sc.h - dy) * r
              : (sc.h + dy) * r;
        nw = Math.max(60, nw);
        const nh = nw / r;
        c.x = isL ? sc.x + sc.w - nw : ["t", "b"].includes(type) ? sc.x + (sc.w - nw) / 2 : sc.x;
        c.y = isT ? sc.y + sc.h - nh : ["l", "r"].includes(type) ? sc.y + (sc.h - nh) / 2 : sc.y;
        c.w = nw;
        c.h = nh;
      }
      set(clamp(c, dw, dh, r));
    };

    const up = () => { dragRef.current = null; };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  const startDrag = (
    e: React.MouseEvent,
    type: CropDragType,
    crop: CropRect,
    setCrop: (c: CropRect) => void,
    ratio: number | null,
    dw: number,
    dh: number,
    zoom = 1,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      type, sx: e.clientX, sy: e.clientY, sc: { ...crop },
      r: ratio, dw, dh, set: setCrop, zoom,
    };
  };

  return { startDrag };
}
