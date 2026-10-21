"use client";

import { useSafeZoneVisible } from "@/hooks/use-safe-zone-visible";
import { safeZoneForRatio } from "@/lib/storefront";

/** Show or hide the storefront safe zone. Only rendered for storefront presets, which have one. */
export function SafeZoneToggle({ ratio }: { ratio: number | null }) {
  const [visible, setVisible] = useSafeZoneVisible();
  if (!safeZoneForRatio(ratio)) return null;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={visible}
      onClick={() => setVisible(!visible)}
      title="The part of the image every phone and desktop shows"
      className="
        inline-flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold text-text-secondary
        hover:text-text transition-colors duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg
      "
    >
      <span
        aria-hidden="true"
        className={`relative w-7 h-4 rounded-full transition-colors duration-150 ${visible ? "bg-primary" : "bg-border"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-surface shadow-sm transition-transform duration-150 ${visible ? "translate-x-3" : ""}`}
        />
      </span>
      Safe zone
    </button>
  );
}
