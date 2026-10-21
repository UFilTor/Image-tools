"use client";

import { useState } from "react";
import { useToolState } from "@/components/tool-state-provider";
import { Button } from "@/components/ui/button";
import { SEND_TARGETS, TOOLS, type ToolKey } from "@/lib/constants";
import { errorMessage } from "@/lib/errors";

interface SendToProps {
  from: ToolKey;
  /** Name the next tool shows and downloads under */
  fileName: string;
  /** Renders the finished image, same as Download; null or a throw shows an error instead */
  getBlob: () => Promise<Blob | null>;
  disabled?: boolean;
}

const labelOf = (key: ToolKey) => TOOLS.find((t) => t.href === `/${key}`)?.label ?? key;

/**
 * Render the current result and open it in another tool. Shared by the Send to row and the
 * storefront size warning, so both handle busy and errors the same way.
 */
export function useSendImage(fileName: string, getBlob: () => Promise<Blob | null>) {
  const { sendTo } = useToolState();
  const [busy, setBusy] = useState<ToolKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (to: ToolKey, opts?: { enlarge?: boolean }) => {
    setBusy(to);
    setError(null);
    try {
      const blob = await getBlob();
      if (!blob) throw new Error("Couldn't prepare that image. Try again.");
      await sendTo(to, new File([blob], fileName, { type: blob.type || "image/png" }), opts);
      // Success navigates away and unmounts the caller, so busy stays set on purpose.
    } catch (err) {
      setError(errorMessage(err) || "Couldn't prepare that image. Try again.");
      setBusy(null);
    }
  };

  return { busy, error, send };
}

/**
 * "Send to Upscale / Logo / …": hands the current result to the next tool, so a chain like
 * crop → upscale needs no download and re-upload. The next tool starts as if the file was dropped.
 */
export function SendTo({ from, fileName, getBlob, disabled = false }: SendToProps) {
  const { busy, error, send } = useSendImage(fileName, getBlob);

  // Sits inside the page's action row, after Download, so it adds no height: the Logo and
  // crop editors are sized to fit the viewport without scrolling.
  return (
    <div className="flex items-center gap-2 flex-wrap justify-center" role="group" aria-label="Send this image to another tool">
      <span aria-hidden="true" className="hidden sm:block w-px h-6 bg-border mx-1" />
      <span className="text-xs font-semibold text-text-secondary">Send to</span>
      {SEND_TARGETS[from].map((to) => (
        <Button key={to} size="sm" onClick={() => send(to)} disabled={disabled || busy !== null}>
          {busy === to ? "Opening…" : `${labelOf(to)} →`}
        </Button>
      ))}
      {error && <p className="basis-full text-sm text-error font-medium text-center" role="alert">{error}</p>}
    </div>
  );
}
