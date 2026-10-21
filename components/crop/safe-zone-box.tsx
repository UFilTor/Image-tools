import type { SafeZone } from "@/lib/storefront";

/**
 * Storefront safe zone as a dashed box, centered in its positioned parent (the crop box, or the
 * Extend preview canvas): the part of the image every common screen shows.
 */
export function SafeZoneBox({ zone }: { zone: SafeZone }) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${((1 - zone.w) / 2) * 100}%`,
        top: `${((1 - zone.h) / 2) * 100}%`,
        width: `${zone.w * 100}%`,
        height: `${zone.h * 100}%`,
        border: "1.5px dashed rgba(255,255,255,0.95)",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
      }}
    >
      <span className="absolute left-1 top-1 px-1.5 py-0.5 rounded text-[11px] font-semibold leading-none text-white bg-black/55 whitespace-nowrap">
        Safe zone
      </span>
    </div>
  );
}
