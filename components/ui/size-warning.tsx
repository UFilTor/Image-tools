"use client";

import { Button } from "@/components/ui/button";
import { useSendImage } from "@/components/ui/send-to";
import { slotForRatio } from "@/lib/storefront";

interface SizeWarningProps {
  ratio: number | null;
  /** Crop width in source pixels */
  widthPx: number;
  fileName: string;
  getBlob: () => Promise<Blob | null>;
}

/**
 * Storefront presets only: a crop narrower than the slot's sharp size looks soft on 2x and 3x
 * screens. Offers Upscale with the crop already loaded.
 */
export function SizeWarning({ ratio, widthPx, fileName, getBlob }: SizeWarningProps) {
  const slot = slotForRatio(ratio);
  const { busy, error, send } = useSendImage(fileName, getBlob);
  if (!slot || widthPx >= slot.minWidth) return null;

  return (
    <span className="inline-flex items-center gap-2 flex-wrap justify-center" role="status">
      <span className="text-xs text-text-secondary font-medium tabular-nums">
        {widthPx}px wide. Sharp screens need {slot.minWidth}px.
      </span>
      <Button size="sm" onClick={() => send("upscale", { enlargeTo: slot.minWidth })} disabled={busy !== null}>
        {busy ? "Opening…" : "Upscale it →"}
      </Button>
      {error && <span className="text-xs text-error font-medium" role="alert">{error}</span>}
    </span>
  );
}
