"use client";

import { SECONDARY_RATIOS } from "@/lib/constants";
import { isSecondaryRatio } from "@/lib/storefront";

/**
 * How many secondary photos the experience page shows (1, 2 or 3). Each count has its own shape
 * and safe zone, so picking one re-crops at that shape. Only rendered for the Secondary photo preset.
 */
export function SecondaryCountSwitch({
  ratio,
  onChange,
}: {
  ratio: number | null;
  onChange: (value: number, label: string) => void;
}) {
  if (!isSecondaryRatio(ratio)) return null;

  return (
    <div role="group" aria-label="Secondary photos on the experience page" className="inline-flex items-center gap-2">
      <span className="text-xs font-semibold text-text-secondary">Photos</span>
      <div className="inline-flex border border-border rounded-lg overflow-hidden text-xs font-semibold">
        {SECONDARY_RATIOS.map((r) => (
          <button
            key={r.count}
            type="button"
            aria-pressed={r.value === ratio}
            aria-label={`${r.count} secondary ${r.count === 1 ? "photo" : "photos"} (${r.sub})`}
            title={`${r.count} secondary ${r.count === 1 ? "photo" : "photos"}: crop at ${r.sub}`}
            onClick={() => r.value !== ratio && onChange(r.value, r.label)}
            className={`px-2.5 py-1.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
              r.value === ratio ? "bg-primary text-accent" : "bg-transparent text-text-muted hover:text-primary"
            }`}
          >
            {r.count}
          </button>
        ))}
      </div>
    </div>
  );
}
