"use client";

import { useEffect, useState } from "react";
import { useToolState } from "@/components/tool-state-provider";
import { Button } from "@/components/ui/button";
import { checkGatewayAvailable } from "@/lib/ai-client";
import { isLogoLike } from "@/lib/looks-like-logo";
import { errorMessage } from "@/lib/errors";

/**
 * "Looks like a logo": the upscale model is trained on photos, so for flat graphics Logo's Redraw
 * gives crisper letters. A suggestion, never automatic: Redraw costs ~$0.04 and can change shapes,
 * so the click is the go-ahead and Logo shows the result next to the original before it is kept.
 * Hidden when the AI Gateway isn't configured, since Redraw can't run then.
 */
export function RedrawHint({ src, name }: { src: string; name: string }) {
  const { redrawInLogo } = useToolState();
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Tied to the image it came from, so moving to another image hides it without resetting state.
  const [error, setError] = useState<{ src: string; message: string } | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([checkGatewayAvailable(), isLogoLike(src).catch(() => false)]).then(([gateway, logo]) => {
      if (live) setLogoSrc(gateway && logo ? src : null);
    });
    return () => {
      live = false;
    };
  }, [src]);

  if (logoSrc !== src) return null;

  const redraw = async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await (await fetch(src)).blob();
      await redrawInLogo(new File([blob], name, { type: blob.type || "image/png" }));
      // Success navigates to Logo and unmounts this hint.
    } catch (err) {
      setError({ src, message: errorMessage(err) || "Couldn't open Logo. Try again." });
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2 flex-wrap justify-center">
      <span className="text-xs text-text-secondary">Looks like a logo. Redraw gives crisper letters.</span>
      <Button size="sm" onClick={redraw} disabled={busy}>
        {busy ? "Opening…" : "Redraw in Logo · ~$0.04"}
      </Button>
      {error?.src === src && <span className="text-xs text-error font-medium" role="alert">{error.message}</span>}
    </span>
  );
}
