"use client";

import { useEffect } from "react";
import { BOOKMARKLET_VERSION, parseSentPhotos, READY } from "@/lib/bookmarklet";
import { setWebsiteImport } from "@/hooks/use-website-import";

/**
 * The Image Tools end of the "Send to Image Tools" bookmarklet (lib/bookmarklet.ts). Only acts on
 * a tab the bookmarklet opened (?from=bookmarklet with an opener): it tells the opener it is ready,
 * then hands the photos it receives to FromWebsite through the website-import store.
 */
export function BookmarkletReceiver() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const opener: Window | null = window.opener;
    if (params.get("from") !== "bookmarklet" || !opener) return;

    const onMessage = (e: MessageEvent) => {
      // Only the page that opened this tab; anything else posting here is ignored.
      if (e.source !== opener) return;
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
    // No data in it, so any origin may hear it; the photos come back to this page only.
    opener.postMessage({ type: READY }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return null;
}
