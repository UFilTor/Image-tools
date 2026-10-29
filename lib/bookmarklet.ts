// "Send to Image Tools": a bookmarklet and a browser extension (public/extension/) for sites the server
// can't read (a Cloudflare wall that refuses Vercel, or photos that only load with JavaScript, like
// Instagram). Both run inside the page the user already has open, so whatever their browser can
// see, they can send. Arc and Dia don't run bookmarklets, so those browsers use the extension.
//
// Bookmarklet handshake: it opens Image Tools at BOOKMARKLET_PATH, Image Tools answers its opener
// with READY, and the bookmarklet posts PHOTOS back: each photo's URL, plus its bytes when the page
// could read them (same-origin or CORS-enabled images). The extension opens EXTENSION_PATH instead
// and posts PHOTOS into that tab itself. components/bookmarklet-receiver.tsx takes both.

export const BOOKMARKLET_PATH = "/crop?from=bookmarklet";
export const EXTENSION_PATH = "/crop?from=extension";
export const READY = "image-tools:ready";
export const PHOTOS = "image-tools:photos";
/**
 * A saved bookmark keeps the code it was dragged with, and the extension the code it was built
 * with. Bump this whenever what they do changes (bookmarkletMain, collectPhotoUrls or the
 * extension's hand-written files, and the literal inside bookmarkletMain), then run
 * `npm run build:extension`: Image Tools then asks for
 * the bookmark to be dragged again or the extension reloaded. Bookmarks from before versions existed
 * send none and count as 0.
 */
export const BOOKMARKLET_VERSION = 4;

/** The extension's folder name, inside the "Get the extension" zip and after unzipping. */
export const EXTENSION_FOLDER = "send-to-image-tools";
/**
 * Every file in public/extension/, which "Get the extension" zips (served at /extension/<name>).
 * scripts/build-extension.mjs writes the first three; the rest are hand-written.
 */
export const EXTENSION_FILES = [
  "manifest.json",
  "config.js",
  "collect.js",
  "background.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "icon-16.png",
  "icon-32.png",
  "icon-48.png",
  "icon-128.png",
  "icon.svg",
  "README.md",
];

export interface SentPhoto {
  url: string;
  blob?: Blob;
}

export interface SentPhotos {
  page: string;
  photos: SentPhoto[];
  version: number;
  via: "bookmark" | "extension";
}

export interface CollectOptions {
  /** A loaded image whose shorter side is under this is an icon (default 300). */
  minSide?: number;
  /** At most this many URLs (default 30). */
  max?: number;
  /** The extension's picker: keep logos, icons and SVGs, the user filters by size there. */
  everything?: boolean;
  /** "area": largest first, for sending (default). "page": in page order, for the picker. */
  order?: "area" | "page";
}

/**
 * The URLs of the page's large photos. Shared by the bookmarklet (stringified into its
 * javascript: URL) and the extension (generated into public/extension/collect.js by
 * scripts/build-extension.mjs), so it must not reference anything outside itself.
 */
export function collectPhotoUrls(options: CollectOptions = {}): string[] {
  const MIN_SIDE = options.minSide ?? 300;
  const MAX = options.max ?? 30;
  const everything = options.everything ?? false;
  // Path words that mark a site's chrome, not its photos (the scraper's looksLikePhoto list, short).
  // Whole words only, so iconic-sunset.jpg or /catalogo/ stay photos.
  const CHROME = /(^|[^a-z])(logo|icon|sprite|favicon|avatar|emoji|badge|placeholder|spinner|loader|pixel|tracking)s?([^a-z]|$)/i;
  // Where lazy-loading scripts park the real address until the image scrolls into view.
  const LAZY_SRC = ["data-src", "data-lazy-src", "data-original", "data-lazy", "data-url"];
  const LAZY_SRCSET = ["data-srcset", "data-lazy-srcset"];
  const LAZY_BG = ["data-bg", "data-background", "data-background-image"];
  const found = new Map<string, { url: string; area: number; el: Element }>();

  const attr = (el: Element, names: string[]) => names.map((n) => el.getAttribute(n)).find(Boolean) ?? undefined;

  const add = (raw: string | null | undefined, area: number, el: Element) => {
    if (!raw || raw.startsWith("data:")) return;
    let url: URL;
    try {
      url = new URL(raw, location.href);
    } catch {
      return;
    }
    if (!/^https?:$/.test(url.protocol)) return;
    if (!everything && (/\.svg$/i.test(url.pathname) || CHROME.test(url.pathname))) return;
    const prev = found.get(url.href);
    // The first element keeps its place, for page order.
    if (!prev || area > prev.area) found.set(url.href, { url: url.href, area, el: prev?.el ?? el });
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
    if (!everything && /logo|profile picture|avatar/i.test(img.alt)) continue;
    const lazySrc = attr(img, LAZY_SRC);
    // Every srcset that can hold a larger copy: the image's own, its lazy one, and its <picture> sources.
    const picture = img.parentElement?.tagName === "PICTURE" ? img.parentElement : null;
    const sources = picture ? Array.from(picture.querySelectorAll("source")) : [];
    const srcsets = [img, ...sources].flatMap((el) => [el.getAttribute("srcset"), attr(el, LAZY_SRCSET)]).filter(Boolean);
    const bigger = srcsets.length ? widest(srcsets.join(", ")) : undefined;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    // A loaded image under MIN_SIDE is an icon, unless a larger copy waits in a srcset or a lazy-load attribute.
    if (w && h && Math.min(w, h) < MIN_SIDE && !bigger && !lazySrc) continue;
    const box = img.getBoundingClientRect();
    add(bigger ?? lazySrc ?? (img.currentSrc || img.src), Math.max(w * h, box.width * box.height, 1), img);
  }

  // Photos shown as CSS backgrounds (hero banners, gallery tiles), or parked in a lazy-load attribute.
  // TODO(simplification): only the first 5000 elements are checked (getComputedStyle per element is
  // slow), so backgrounds further down a very long page are missed. Upgrade path: check only elements
  // with an inline style or a class, or walk the stylesheets for url() rules.
  const elements = document.querySelectorAll<HTMLElement>("body *");
  for (let i = 0; i < elements.length && i < 5000; i++) {
    const el = elements[i];
    const box = el.getBoundingClientRect();
    const lazyBg = attr(el, LAZY_BG);
    // Themes also use these attributes for words and colors (data-background="dark"): only url(...)
    // or something shaped like an image address counts.
    const lazyBgUrl =
      lazyBg?.match(/url\(["']?([^"')]+)["']?\)/)?.[1] ??
      (lazyBg && (/^(https?:)?\/\//.test(lazyBg) || /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(lazyBg)) ? lazyBg : undefined);
    if (lazyBgUrl) add(lazyBgUrl, Math.max(box.width * box.height, 1), el);
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || !bg.includes("url(")) continue;
    if (box.width < 200 || box.height < 120) continue;
    for (const match of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) add(match[1], box.width * box.height, el);
  }

  const list = [...found.values()];
  if (options.order === "page") {
    // Node.DOCUMENT_POSITION_FOLLOWING (4): b comes after a.
    list.sort((a, b) => (a.el === b.el ? 0 : a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1));
  } else {
    list.sort((a, b) => b.area - a.area);
  }
  // TODO(simplification): MAX photos; on a page with more, the rest are left out without a note.
  // Upgrade path: send them all and let FromWebsite cap what it shows.
  return list.slice(0, MAX).map((p) => p.url);
}

/**
 * The bookmarklet's body. It is stringified into a javascript: URL (bookmarkletHref) with the
 * collector passed in, so it must not reference anything outside itself: every other helper lives
 * inside, which is why the path, message types and version above are repeated as literals (a test
 * keeps them in step).
 */
export function bookmarkletMain(origin: string, collect: () => string[]): void {
  const list = collect();
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

  // The extension does the same in public/extension/background.js (readPhotos, toast); keep the two in step.
  // Bytes from the browser's cache where the page may read them; the rest go as URLs only and
  // Image Tools fetches them through its own proxy.
  const photos = Promise.all(
    list.map(async (url) => {
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
    win.postMessage({ type: "image-tools:photos", version: 4, page: location.href, photos: await photos }, origin);
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

/** The bookmark's address: the bookmarklet above with its collector, bound to this Image Tools origin. */
export function bookmarkletHref(origin: string): string {
  return `javascript:${encodeURIComponent(`(${bookmarkletMain.toString()})(${JSON.stringify(origin)}, ${collectPhotoUrls.toString()})`)}`;
}

/**
 * Whether a tab Image Tools opened as `?from=<from>` takes a message: from its opener for the
 * bookmarklet, from itself (same origin, so the extension's script in this tab) for the extension.
 * Anything else posting to the page is ignored.
 */
export function acceptsPhotos(
  from: string | null,
  message: { source: MessageEventSource | null; origin: string },
  tab: { opener: Window | null; self: Window; origin: string },
): boolean {
  if (from === "bookmarklet") return tab.opener !== null && message.source === tab.opener;
  if (from === "extension") return message.source === tab.self && message.origin === tab.origin;
  return false;
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
  const via = "via" in data && data.via === "extension" ? "extension" : "bookmark";
  return { page: data.page, photos, version, via };
}
