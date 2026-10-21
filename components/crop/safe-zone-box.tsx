import type { SafeZone } from "@/lib/storefront";

/**
 * Storefront safe zone, centered in its positioned parent (the crop box, or the Extend preview
 * canvas): the part of the image every common screen shows. Everything around it is dimmed, so
 * what some screens cut off reads as "at risk" at a glance.
 */
export function SafeZoneBox({ zone, className = "" }: { zone: SafeZone; className?: string }) {
  return (
    // Clips the dimming shadow to the parent
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      <div
        className="absolute"
        style={{
          left: `${((1 - zone.w) / 2) * 100}%`,
          top: `${((1 - zone.h) / 2) * 100}%`,
          width: `${zone.w * 100}%`,
          height: `${zone.h * 100}%`,
          border: "2px dashed #ffffff",
          // A dark hairline keeps the dashes visible on light photos; the spread dims the rest.
          boxShadow: "0 0 0 1px rgba(0,0,0,0.6), 0 0 0 9999px rgba(0,0,0,0.4)",
        }}
      >
        <span className="absolute left-1.5 top-1.5 px-2 py-1 rounded-md text-xs font-semibold leading-none text-white bg-black/70 whitespace-nowrap">
          Safe zone
        </span>
      </div>
    </div>
  );
}
