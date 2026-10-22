import type { PhotoSource } from "./brand-scrape/types";

/** Scraped images load through the same-origin proxy (the browser can't read cross-origin pixels). */
export const proxiedImage = (url: string) => `/api/image?url=${encodeURIComponent(url)}`;

/**
 * A found photo's bytes: the original, or the site's optimized copy when the original can't be
 * fetched (over the proxy's 12 MB cap, for one). Throws user-facing copy when neither loads.
 */
export async function fetchPhoto(source: PhotoSource, fetcher: typeof fetch = fetch): Promise<Blob> {
  for (const url of [source.url, source.fallbackUrl]) {
    if (!url) continue;
    const res = await fetcher(proxiedImage(url));
    if (res.ok) return res.blob();
  }
  throw new Error("Couldn't download one of the images. Try another one.");
}
