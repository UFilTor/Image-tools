// "Send to Image Tools": a bookmarklet for sites the server can't read (a Cloudflare wall that
// refuses Vercel, or photos that only load with JavaScript, like Instagram). It runs inside the
// page the user already has open, so whatever their browser can see, it can send.
//
// Handshake: the bookmarklet opens Image Tools at BOOKMARKLET_PATH, Image Tools answers its opener
// with READY, and the bookmarklet posts PHOTOS back: each photo's URL, plus its bytes when the page
// could read them (same-origin or CORS-enabled images). components/bookmarklet-receiver.tsx takes it.

export const BOOKMARKLET_PATH = "/crop?from=bookmarklet";
export const READY = "image-tools:ready";
export const PHOTOS = "image-tools:photos";
/**
 * A saved bookmark keeps the code it was dragged with. Bump this whenever bookmarkletMain changes
 * (and the literal inside it): Image Tools then asks older bookmarks to be dragged again.
 * Bookmarks from before versions existed send none and count as 0.
 */
export const BOOKMARKLET_VERSION = 2;

export interface SentPhoto {
  url: string;
  blob?: Blob;
}

export interface SentPhotos {
  page: string;
  photos: SentPhoto[];
  version: number;
}

/**
 * The bookmarklet's body. It is stringified into a javascript: URL (bookmarkletHref), so it must
 * not reference anything outside itself: every helper and constant lives inside, which is why the
 * path, message types and version above are repeated as literals (a test keeps them in step).
 */
export function bookmarkletMain(origin: string): void {
  const MIN_SIDE = 300;
  const MAX = 30;
  // Path words that mark a site's chrome, not its photos (the scraper's looksLikePhoto list, short).
  // Whole words only, so iconic-sunset.jpg or /catalogo/ stay photos.
  const CHROME = /(^|[^a-z])(logo|icon|sprite|favicon|avatar|emoji|badge|placeholder|spinner|loader|pixel|tracking)s?([^a-z]|$)/i;
  const found = new Map<string, { url: string; area: number }>();

  const add = (raw: string | null | undefined, area: number) => {
    if (!raw || raw.startsWith("data:")) return;
    let url: URL;
    try {
      url = new URL(raw, location.href);
    } catch {
      return;
    }
    if (!/^https?:$/.test(url.protocol) || /\.svg$/i.test(url.pathname) || CHROME.test(url.pathname)) return;
    const prev = found.get(url.href);
    if (!prev || area > prev.area) found.set(url.href, { url: url.href, area });
  };

  // The widest candidate in a srcset. Split on ", " only: CDN URLs carry bare commas.
  const widest = (srcset: string) => {
    let best: string | undefined;
    let bestWidth = -1;
    for (const part of srcset.split(/,\s+/)) {
      const [candidate, descriptor = "1x"] = part.trim().split(/\s+/);
      const width = parseFloat(descriptor) * (descriptor.endsWith("x") ? 1000 : 1);
      if (candidate && width > bestWidth) {
        best = candidate;
        bestWidth = width;
      }
    }
    return best;
  };

  for (const img of Array.from(document.images)) {
    // TODO(simplification): English alt words only, so a localized Instagram (Swedish "profilbild")
    // sends the profile picture too. Upgrade path: also skip images smaller than 200px on screen.
    if (/logo|profile picture|avatar/i.test(img.alt)) continue;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const bigger = img.srcset ? widest(img.srcset) : undefined;
    // A loaded image under MIN_SIDE is an icon, unless its srcset offers a larger copy.
    if (w && h && Math.min(w, h) < MIN_SIDE && !bigger) continue;
    add(bigger ?? (img.currentSrc || img.src), w * h || 1);
  }

  // Photos shown as CSS backgrounds (hero banners, gallery tiles).
  // TODO(simplification): only the first 5000 elements are checked (getComputedStyle per element is
  // slow), so backgrounds further down a very long page are missed. Upgrade path: check only elements
  // with an inline style or a class, or walk the stylesheets for url() rules.
  const elements = document.querySelectorAll<HTMLElement>("body *");
  for (let i = 0; i < elements.length && i < 5000; i++) {
    const bg = getComputedStyle(elements[i]).backgroundImage;
    if (!bg || !bg.includes("url(")) continue;
    const box = elements[i].getBoundingClientRect();
    if (box.width < 200 || box.height < 120) continue;
    for (const match of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) add(match[1], box.width * box.height);
  }

  const list = [...found.values()].sort((a, b) => b.area - a.area).slice(0, MAX);
  if (!list.length) {
    alert("No large photos on this page yet. Scroll so the photos load, then click the bookmark again.");
    return;
  }

  const toast = document.createElement("div");
  toast.textContent = `Sending ${list.length} photo${list.length === 1 ? "" : "s"} to Image Tools…`;
  Object.assign(toast.style, {
    position: "fixed",
    zIndex: "2147483647",
    top: "16px",
    right: "16px",
    maxWidth: "320px",
    background: "#022C12",
    color: "#fff",
    font: "14px/1.4 system-ui, sans-serif",
    padding: "10px 14px",
    borderRadius: "10px",
    boxShadow: "0 4px 16px rgba(0,0,0,.25)",
  });
  document.body.appendChild(toast);
  const done = (text: string, ms: number) => {
    toast.textContent = text;
    setTimeout(() => toast.remove(), ms);
  };

  // Opened right away: a pop-up is only allowed during the click.
  const win = window.open(origin + "/crop?from=bookmarklet", "_blank");
  if (!win) {
    done("Your browser blocked the pop-up. Allow pop-ups for this site, then click the bookmark again.", 8000);
    return;
  }

  // Bytes from the browser's cache where the page may read them; the rest go as URLs only and
  // Image Tools fetches them through its own proxy.
  const photos = Promise.all(
    list.map(async ({ url }) => {
      try {
        const res = await fetch(url, { cache: "force-cache" });
        const blob = res.ok ? await res.blob() : null;
        return blob && blob.type.startsWith("image/") ? { url, blob } : { url };
      } catch {
        return { url };
      }
    }),
  );

  let sent = false;
  const onMessage = async (e: MessageEvent) => {
    if (e.source !== win || e.origin !== origin || e.data?.type !== "image-tools:ready") return;
    window.removeEventListener("message", onMessage);
    sent = true;
    win.postMessage({ type: "image-tools:photos", version: 2, page: location.href, photos: await photos }, origin);
    done(`Sent ${list.length} photo${list.length === 1 ? "" : "s"} to Image Tools.`, 2500);
  };
  window.addEventListener("message", onMessage);
  // Long enough for a Vercel sign-in in the new tab before Image Tools can answer.
  setTimeout(() => {
    if (sent) return;
    window.removeEventListener("message", onMessage);
    done("Image Tools didn't answer. Check that it opened and that you are signed in to Vercel.", 8000);
  }, 300_000);
}

/** The bookmark's address: the bookmarklet above, bound to this Image Tools origin. */
export function bookmarkletHref(origin: string): string {
  return `javascript:${encodeURIComponent(`(${bookmarkletMain.toString()})(${JSON.stringify(origin)})`)}`;
}

/** Read a PHOTOS message at the boundary: a page URL and photos with a URL each, bytes optional. */
export function parseSentPhotos(data: unknown): SentPhotos | null {
  if (typeof data !== "object" || data === null || !("type" in data) || data.type !== PHOTOS) return null;
  if (!("page" in data) || typeof data.page !== "string" || !("photos" in data) || !Array.isArray(data.photos)) return null;
  const items: unknown[] = data.photos;
  const photos: SentPhoto[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null || !("url" in item) || typeof item.url !== "string") continue;
    if (!/^https?:\/\//.test(item.url)) continue;
    const blob = "blob" in item && item.blob instanceof Blob && item.blob.type.startsWith("image/") ? item.blob : undefined;
    photos.push(blob ? { url: item.url, blob } : { url: item.url });
  }
  const version = "version" in data && typeof data.version === "number" ? data.version : 0;
  return { page: data.page, photos, version };
}
