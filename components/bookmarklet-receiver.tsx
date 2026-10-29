"use client";

import { useEffect } from "react";
import { acceptsPhotos, BOOKMARKLET_VERSION, parseSentPhotos, READY } from "@/lib/bookmarklet";
import { setWebsiteImport } from "@/hooks/use-website-import";

/**
 * The Image Tools end of "Send to Image Tools" (lib/bookmarklet.ts). Only acts on a tab one of them
 * opened, and hands the photos it receives to FromWebsite through the website-import store:
 * - ?from=bookmarklet with an opener: tells the opener it is ready, then takes its PHOTOS message.
 * - ?from=extension: flags the page ready (a data attribute the extension polls for), then takes
 *   the PHOTOS message the extension posts into this page.
 */
export function BookmarkletReceiver() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    const opener: Window | null = window.opener;
    if (from === "bookmarklet" ? !opener : from !== "extension") return;

    const onMessage = (e: MessageEvent) => {
      // Only the sender that opened this tab; anything else posting here is ignored.
      if (!acceptsPhotos(from, e, { opener, self: window, origin: window.location.origin })) return;
      const sent = parseSentPhotos(e.data);
      if (!sent) return;
      let site = sent.page;
      try {
        site = new URL(sent.page).hostname.replace(/^www\./, "");
      } catch {
        // keep the raw page address as the label
      }
      setWebsiteImport({
        site,
        via: sent.via,
        outdated: sent.version < BOOKMARKLET_VERSION,
        items: sent.photos.map((p, i) => ({
          url: p.url,
          score: sent.photos.length - i,
          ...(p.blob ? { localUrl: URL.createObjectURL(p.blob) } : {}),
        })),
      });
      window.removeEventListener("message", onMessage);
      // Drop the marker once the photos are in, so a reload doesn't wait for them again. Not
      // earlier: Strict Mode runs this effect twice, and the second run must still see it.
      params.delete("from");
      const query = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
    };
    window.addEventListener("message", onMessage);
    if (from === "bookmarklet" && opener) {
      // No data in it, so any origin may hear it; the photos come back to this page only.
      opener.postMessage({ type: READY }, "*");
    } else {
      document.documentElement.dataset.imageToolsReceiver = "ready";
    }
    return () => {
      window.removeEventListener("message", onMessage);
      delete document.documentElement.dataset.imageToolsReceiver;
    };
  }, []);
  return null;
}
