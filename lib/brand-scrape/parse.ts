import type { ExperienceCandidate, ImageCandidate, PhotoSource } from "./types";

// Pure HTML scanning for the client-brand scraper. No DOM and no HTML parser
// dependency: every extractor works on regex tag scans, which is enough for
// meta tags, images, headings and JSON-LD and keeps this module runnable in
// tests and on the server alike.
//
// TODO(simplification): tag scanning has no notion of nesting, so the
// experience heuristic looks at a character window around each heading rather
// than at its card element. Swap in a real parser (node-html-parser) if sites
// with deeply nested cards turn out to need it.

export interface Tag {
  name: string;
  attrs: Record<string, string>;
  index: number;
}

export interface PageData {
  url: string;
  html: string;
  title?: string;
  siteName?: string;
  description?: string;
  ogImage?: string;
  metas: Tag[];
  links: Tag[];
  imgs: Tag[];
  /** <source srcset> inside <picture>; video sources carry src only and are left out. */
  sources: Tag[];
  /** <link rel="preload" as="image">: the hero a site preloads is the one it considers its best. */
  preloadImages: string[];
  /** Tags that show a photo as a CSS background (inline style or a lazy-load data-bg attribute). */
  backgrounds: Tag[];
  anchors: Tag[];
  headings: { level: number; text: string; index: number; end: number }[];
  jsonLd: JsonValue[];
}

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

export function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(ATTR_RE)) {
    const name = match[1].toLowerCase();
    attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (match, code) => codePoint(Number(code), match))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => codePoint(parseInt(code, 16), match));
}

// String.fromCodePoint throws on anything above U+10FFFF; a broken entity on
// a scraped page must not take the whole scrape down.
function codePoint(code: number, fallback: string): string {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : fallback;
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^<>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// Image Tools copy: every pattern that runs on fetched HTML is linear. Attribute runs stop at
// the next "<" ([^<>]* instead of [^>]*), and paired blocks are found with one forward scan
// (removeBlocks) instead of lazy [\s\S]*? regexes, which rescanned to the end of the page from
// every unclosed opener: 200 KB of "<a " took 13.9 s in a security review.
function scanTags(html: string, names: string[]): Tag[] {
  const re = new RegExp(`<(${names.join("|")})\\b([^<>]*)>`, "gi");
  const tags: Tag[] = [];
  for (const match of html.matchAll(re)) {
    tags.push({
      name: match[1].toLowerCase(),
      attrs: parseAttrs(match[2]),
      index: match.index ?? 0,
    });
  }
  return tags;
}

// Carousels and hero sections often show photos as CSS backgrounds instead of <img>: an inline
// style with url(...) or, lazy-loaded, a data-bg attribute (truestory.no had 15 gallery photos
// that way and not one <img>). Only tags whose attributes mention one of those are parsed.
function scanBackgroundTags(html: string): Tag[] {
  const re = /<([a-z][a-z0-9-]*)\b([^<>]*?(?:background|data-bg)[^<>]*)>/gi;
  const tags: Tag[] = [];
  for (const match of html.matchAll(re)) {
    const attrs = parseAttrs(match[2]);
    if (backgroundSource(attrs)) tags.push({ name: match[1].toLowerCase(), attrs, index: match.index ?? 0 });
  }
  return tags;
}

const STYLE_URL_RE = /background(?:-image)?\s*:[^;]*?url\(\s*(['"]?)([^'")]+)\1\s*\)/i;

// Themes also use data-background for a colour or a keyword ("#1a1a1a", "dark"), and some write
// the lazy value as url(...): only a value that reads as a path or address is an image.
function lazyImageValue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = (raw.match(/^\s*url\(\s*(['"]?)(.*?)\1\s*\)\s*$/i)?.[2] ?? raw).trim();
  if (!value || /^(#|rgba?\(|hsla?\(|var\(|transparent$|none$)/i.test(value)) return undefined;
  return /[/.]/.test(value) ? value : undefined;
}

/** The photo a tag shows as a CSS background: the lazy-load attribute beats the placeholder in style. */
export function backgroundSource(attrs: Record<string, string>): string | undefined {
  const lazy = lazyImageValue(attrs["data-bg"] ?? attrs["data-background"] ?? attrs["data-background-image"]);
  if (lazy) return lazy;
  return attrs.style ? STYLE_URL_RE.exec(attrs.style)?.[2] : undefined;
}

// An og:image that resolves to the site root (an empty content attribute, say) is no image.
export function plausibleImageUrl(candidate: string | undefined): string | undefined {
  if (!candidate || candidate.startsWith("data:")) return undefined;
  try {
    const parsed = new URL(candidate);
    if (parsed.pathname === "/" && !parsed.search) return undefined;
  } catch {
    return undefined;
  }
  return candidate;
}

export function resolveUrl(candidate: string | undefined, baseUrl: string): string | undefined {
  if (!candidate) return undefined;
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;
  if (/^(javascript|mailto|tel):/i.test(trimmed)) return undefined;
  if (trimmed.startsWith("data:")) return trimmed;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return undefined;
  }
}

// Next.js and Vercel image optimizers serve every image from one path (/_next/image?url=…), so
// keyed by path all of a site's photos collapsed into one (2026-10-21: an Understory experience
// page showed 1 of its 4 photos). The original image is the real photo, and full size too.
// WordPress's WebP Converter for Media does the same through webpc-passthru.php?src=… (2026-10-22:
// sherlocked.se served 50 photos and its logo that way, and the logo's key then dropped them all).
const OPTIMIZERS: { path: RegExp; param: string }[] = [
  { path: /\/_(?:next|vercel)\/image\/?$/, param: "url" },
  { path: /\/webpc-passthru\.php$/, param: "src" },
];

export function unwrapOptimizer(url: string | undefined, baseUrl: string): string | undefined {
  if (!url || url.startsWith("data:")) return url;
  try {
    const parsed = new URL(url);
    const optimizer = OPTIMIZERS.find((o) => o.path.test(parsed.pathname));
    if (!optimizer) return url;
    const inner = parsed.searchParams.get(optimizer.param);
    return (inner && resolveUrl(inner, baseUrl)) || url;
  } catch {
    return url;
  }
}

/** A found image's original, with the optimized copy it was served as kept for a fallback. */
export function photoSource(raw: string | undefined, baseUrl: string): PhotoSource | undefined {
  const served = resolveUrl(raw, baseUrl);
  const url = unwrapOptimizer(served, baseUrl);
  if (!url) return undefined;
  return served && served !== url ? { url, fallbackUrl: served } : { url };
}

/** What JSON.parse can return. Image Tools copy: replaces the kit's `unknown` + casts. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** A JSON object (not an array, not null): narrows without a cast. */
function isRecord(v: JsonValue | undefined): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `{ url: "…" }` → the url, as structured data writes images and logos. */
function urlOf(v: JsonValue | undefined): string | undefined {
  return isRecord(v) && typeof v.url === "string" ? v.url : undefined;
}

/**
 * Remove every <tag ...>…</tag> block in one forward pass, handing each block's attributes and
 * body to `onBlock`. An opener without a closing tag swallows the rest of the page, as a browser
 * treats an unclosed script or style; searching on from the next opener would make this quadratic.
 */
function removeBlocks(html: string, tag: string, onBlock?: (attrs: string, body: string) => void): string {
  const openRe = new RegExp(`<${tag}\\b([^<>]*)>`, "gi");
  const closeRe = new RegExp(`</${tag}\\s*>`, "gi");
  let out = "";
  let pos = 0;
  for (;;) {
    openRe.lastIndex = pos;
    const open = openRe.exec(html);
    if (!open) return out + html.slice(pos);
    closeRe.lastIndex = openRe.lastIndex;
    const close = closeRe.exec(html);
    onBlock?.(open[1], html.slice(openRe.lastIndex, close ? close.index : html.length));
    out += html.slice(pos, open.index) + " ";
    if (!close) return out;
    pos = closeRe.lastIndex;
  }
}

/** Remove <!-- … --> comments in one pass; an unclosed comment drops the rest of the page. */
function removeComments(html: string): string {
  let out = "";
  let pos = 0;
  for (;;) {
    const start = html.indexOf("<!--", pos);
    if (start < 0) return out + html.slice(pos);
    out += html.slice(pos, start) + " ";
    const end = html.indexOf("-->", start + 4);
    if (end < 0) return out;
    pos = end + 3;
  }
}

/** Largest page parsed; the fetch cap allows more, and nothing useful sits that deep in a page. */
const MAX_PARSE_CHARS = 1_000_000;

export function parseHtml(rawHtml: string, url: string): PageData {
  const html = rawHtml.length > MAX_PARSE_CHARS ? rawHtml.slice(0, MAX_PARSE_CHARS) : rawHtml;
  // Scripts and styles are lifted out before tag scanning so an <img> inside a
  // template string does not count as an image on the page.
  const jsonLd: JsonValue[] = [];
  let stripped = removeBlocks(html, "script", (attrs, body) => {
    const parsed = parseAttrs(attrs);
    if (/ld\+json/i.test(parsed.type ?? "")) {
      try {
        const data = JSON.parse(body.trim());
        if (Array.isArray(data)) for (const item of data) jsonLd.push(item);
        else jsonLd.push(data);
      } catch {
        // Broken JSON-LD is common; skip it.
      }
    }
  });
  // Image Tools copy: style blocks are only dropped (the kit also kept them for colour ranking).
  stripped = removeBlocks(stripped, "style");
  // Comments and <noscript> blocks often hold lazy-load fallbacks that repeat
  // images already counted; drop them.
  stripped = removeBlocks(removeComments(stripped), "noscript");

  const metas = scanTags(stripped, ["meta"]);
  const links = scanTags(stripped, ["link"]);
  const imgs = scanTags(stripped, ["img"]);
  const sources = scanTags(stripped, ["source"]).filter((t) => t.attrs.srcset);
  const backgrounds = scanBackgroundTags(stripped);
  const preloadImages = links
    .filter((t) => /preload/i.test(t.attrs.rel ?? "") && (t.attrs.as ?? "").toLowerCase() === "image")
    .map((t) => (t.attrs.imagesrcset ? imageSource({ srcset: t.attrs.imagesrcset }) : t.attrs.href))
    .filter((u): u is string => Boolean(u));
  const anchors = scanTags(stripped, ["a"]);

  const meta = (key: string) =>
    metas.find(
      (t) =>
        (t.attrs.property ?? "").toLowerCase() === key || (t.attrs.name ?? "").toLowerCase() === key
    )?.attrs.content;

  const headings: PageData["headings"] = [];
  // Once a level has no closing tag after some point, later openers of that level can't have
  // one either: remember that instead of rescanning to the end for every opener.
  const unclosed = new Set<string>();
  const headingOpen = /<h([1-3])\b[^<>]*>/gi;
  for (let open = headingOpen.exec(stripped); open; open = headingOpen.exec(stripped)) {
    const level = open[1];
    if (unclosed.has(level)) continue;
    const closeRe = new RegExp(`</h${level}\\s*>`, "gi");
    closeRe.lastIndex = headingOpen.lastIndex;
    const close = closeRe.exec(stripped);
    if (!close) {
      unclosed.add(level);
      continue;
    }
    const text = stripTags(stripped.slice(headingOpen.lastIndex, close.index));
    if (text) headings.push({ level: Number(level), text, index: open.index, end: closeRe.lastIndex });
    headingOpen.lastIndex = closeRe.lastIndex;
  }

  const titleOpen = /<title\b[^<>]*>/i.exec(stripped);
  const titleClose = titleOpen ? /<\/title\s*>/i.exec(stripped.slice(titleOpen.index + titleOpen[0].length)) : null;
  const titleText =
    titleOpen && titleClose
      ? stripped.slice(titleOpen.index + titleOpen[0].length, titleOpen.index + titleOpen[0].length + titleClose.index)
      : undefined;

  return {
    url,
    html: stripped,
    title: titleText !== undefined ? stripTags(titleText) : undefined,
    siteName: meta("og:site_name") ?? meta("application-name"),
    description: meta("og:description") ?? meta("description"),
    ogImage: plausibleImageUrl(resolveUrl(meta("og:image") ?? meta("twitter:image"), url)),
    metas,
    links,
    imgs,
    sources,
    preloadImages,
    backgrounds,
    anchors,
    headings,
    jsonLd,
  };
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

// The URL an <img> really shows: the largest srcset entry beats src, and lazy
// loaders park the real image in a data-* attribute while src is a placeholder.
export function imageSource(attrs: Record<string, string>): string | undefined {
  const srcset = attrs["data-srcset"] ?? attrs.srcset;
  if (srcset) {
    const best = parseSrcset(srcset).sort((a, b) => b.w - a.w)[0];
    if (best) return best.u;
  }
  return (
    attrs["data-src"] ??
    attrs["data-lazy-src"] ??
    attrs["data-original"] ??
    attrs["data-image"] ??
    attrs.src
  );
}

// Image CDNs put commas inside the URL (imagekit's "tr=w-640,q=75"), so a split on "," breaks
// entries apart: each entry is a URL up to whitespace, then its descriptor up to the next comma.
function parseSrcset(srcset: string): { u: string; w: number }[] {
  const out: { u: string; w: number }[] = [];
  let rest = srcset.trim();
  while (rest) {
    const urlMatch = rest.match(/^\S+/);
    if (!urlMatch) break;
    let u = urlMatch[0];
    rest = rest.slice(u.length);
    const trailing = u.match(/,+$/);
    if (trailing) {
      u = u.slice(0, -trailing[0].length);
      if (u) out.push({ u, w: 0 });
      rest = rest.trimStart();
      continue;
    }
    const descMatch = rest.match(/^([^,]*)(?:,|$)/);
    const desc = (descMatch?.[1] ?? "").trim();
    rest = rest.slice(descMatch?.[0].length ?? 0).trimStart();
    const size = desc.match(/^([\d.]+)[wx]$/);
    out.push({ u, w: size ? parseFloat(size[1]) : 0 });
  }
  return out;
}

// TODO(simplification): substring heuristic for what counts as a photo. Ceiling: it also drops
// real photos whose URL happens to contain a word like "google" (googleusercontent-hosted
// images) or "flag". Upgrade path: judge by the image's size and aspect after loading.
const NON_PHOTO_RE =
  /(logo|icon|sprite|pixel|tracking|badge|flag|avatar|payment|visa|mastercard|paypal|klarna|tripadvisor|trustpilot|google|facebook|instagram|arrow|spacer|blank|placeholder|loading|1x1|\.svg([?#]|$)|\.gif([?#]|$)|gravatar|emoji|captcha|maps\.g|cookie|ytimg|youtube|vimeocdn|\/shapes\/|header-shapes)/i;

const LOGO_RE = /logo|brand|wordmark|site-title|sitename/i;

function dimension(value: string | undefined): number {
  const n = parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

// Wix writes the rendered size into the path (/v1/fill/w_980,h_440,...) and serves a blurred
// 49px stand-in first (blur_2): both say "not a photo" without a width attribute to read.
function urlDeclaredTiny(url: string): boolean {
  if (/[/,]blur_\d/i.test(url)) return true;
  const size = url.match(/\/w_(\d+),h_(\d+)/i);
  return size ? Number(size[1]) < 200 || Number(size[2]) < 120 : false;
}

function urlDeclaredWidth(url: string): number {
  const size = url.match(/\/w_(\d+),h_(\d+)/i);
  return size ? Number(size[1]) : 0;
}

// Declared tiny images are icons even when the name does not say so.
function isTinyImage(attrs: Record<string, string>): boolean {
  const w = dimension(attrs.width);
  const h = dimension(attrs.height);
  return (w > 0 && w < 200) || (h > 0 && h < 120);
}

/**
 * One key per underlying photo, so two crops of the same file count once. Wix keys by media id
 * (the ~mv2 segment, crops differ after it); Squarespace serves one file from two hosts with
 * different ids in the path, so the file name is what they share. Everything else: the URL
 * without its query.
 */
export function photoKey(url: string): string {
  const wix = url.match(/\/media\/([^/]+~mv2[^/]*)/i);
  if (wix) return `wix:${wix[1]}`;
  if (/squarespace(?:-cdn)?\.com\//i.test(url)) {
    const name = url.split("?")[0].split("/").pop() ?? url;
    try {
      return `sqs:${decodeURIComponent(name).toLowerCase()}`;
    } catch {
      // A stray % in the file name is no reason to drop the whole scrape; the raw name keys it.
      return `sqs:${name.toLowerCase()}`;
    }
  }
  return url.split("?")[0];
}

/**
 * The one gate every extractPhotos source goes through: not a logo, badge, icon, video thumbnail
 * or tiny crop. The URL arrives resolved, so the logo words are matched against its path only:
 * a site at brandywine-tours.com must not lose every photo to "brand" in its host name. The
 * non-photo words keep the host, since several of them are hosts (ytimg, gravatar, maps.g).
 */
export function looksLikePhoto(url: string, alt?: string): boolean {
  if (!url || url.startsWith("data:")) return false;
  const path = url.replace(/^[a-z]+:\/\/[^/]*/i, "");
  return !NON_PHOTO_RE.test(`${url} ${alt ?? ""}`) && !LOGO_RE.test(`${path} ${alt ?? ""}`) && !urlDeclaredTiny(url);
}

export function extractLogos(page: PageData): ImageCandidate[] {
  const found = new Map<string, ImageCandidate>();
  const add = (url: string | undefined, score: number, alt?: string) => {
    const resolved = resolveUrl(url, page.url);
    if (!resolved) return;
    const existing = found.get(resolved);
    if (!existing || existing.score < score) found.set(resolved, { url: resolved, alt, score });
  };

  for (const img of page.imgs) {
    const src = imageSource(img.attrs);
    const haystack = `${src ?? ""} ${img.attrs.alt ?? ""} ${img.attrs.class ?? ""} ${img.attrs.id ?? ""}`;
    if (LOGO_RE.test(haystack)) {
      // Header logos come first in the document, so an early index is a hint.
      const early = img.index < page.html.length * 0.2 ? 20 : 0;
      add(src, 80 + early, img.attrs.alt);
    }
  }

  for (const link of page.links) {
    const rel = (link.attrs.rel ?? "").toLowerCase();
    if (/apple-touch-icon/.test(rel)) add(link.attrs.href, 60);
    else if (/\bicon\b/.test(rel)) {
      const sizes = dimension((link.attrs.sizes ?? "").split("x")[0]);
      // Favicons are tiny; only a large one is worth offering as a logo.
      add(link.attrs.href, sizes >= 96 ? 45 : 20);
    }
  }

  const ogLogo = page.metas.find((t) => /og:logo/i.test(t.attrs.property ?? ""))?.attrs.content;
  add(ogLogo, 70);

  for (const item of flattenJsonLd(page.jsonLd)) {
    const logo = item.logo;
    add(typeof logo === "string" ? logo : urlOf(logo), 75);
  }

  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 8);
}

export function extractPhotos(page: PageData, baseScore = 0): ImageCandidate[] {
  const found = new Map<string, ImageCandidate>();
  // The og:image on a builder site is often the logo file under a name that does not say so:
  // whatever the logo pass picked up is not a photo.
  const logoKeys = new Set(extractLogos(page).map((l) => photoKey(l.url)));
  const add = (url: string | undefined, score: number, alt?: string) => {
    const source = photoSource(url, page.url);
    if (!source || !looksLikePhoto(source.url, alt)) return;
    const key = photoKey(source.url);
    if (logoKeys.has(key)) return;
    const existing = found.get(key);
    const fallbackUrl = source.fallbackUrl ?? existing?.fallbackUrl;
    // Same score, same file: the larger crop is the one to keep.
    const better =
      !existing ||
      existing.score < score ||
      (existing.score === score && urlDeclaredWidth(source.url) > urlDeclaredWidth(existing.url));
    if (better) found.set(key, { ...source, alt, score, ...(fallbackUrl ? { fallbackUrl } : {}) });
    else if (existing && !existing.fallbackUrl && fallbackUrl) existing.fallbackUrl = fallbackUrl;
  };

  add(page.ogImage, 100 + baseScore);
  // The hero a site preloads is the one it considers its best image.
  for (const url of page.preloadImages) add(url, 105 + baseScore);

  for (const source of page.sources) {
    const src = imageSource(source.attrs);
    if (!src || LOGO_RE.test(`${src} ${source.attrs.class ?? ""}`)) continue;
    add(src, 60 + baseScore);
  }

  for (const img of page.imgs) {
    const src = imageSource(img.attrs);
    if (!src) continue;
    const haystack = `${src} ${img.attrs.alt ?? ""} ${img.attrs.class ?? ""} ${img.attrs.id ?? ""}`;
    if (LOGO_RE.test(haystack) || NON_PHOTO_RE.test(haystack)) continue;
    if (isTinyImage(img.attrs)) continue;
    const w = dimension(img.attrs.width);
    const h = dimension(img.attrs.height);
    let score = 50 + baseScore;
    if (w >= 600 || h >= 400) score += 25;
    if (img.attrs.alt && img.attrs.alt.trim().length > 3) score += 10;
    if (/hero|banner|cover|featured|gallery|tour|experience|activity/i.test(haystack)) score += 10;
    add(src, score, img.attrs.alt);
  }

  for (const tag of page.backgrounds) {
    const src = backgroundSource(tag.attrs);
    if (!src) continue;
    const haystack = `${src} ${tag.attrs.class ?? ""} ${tag.attrs.id ?? ""}`;
    if (LOGO_RE.test(haystack) || NON_PHOTO_RE.test(haystack)) continue;
    // No declared size to go on, so a background scores like a plain <img>.
    let score = 50 + baseScore;
    if (/hero|banner|cover|featured|gallery|carousel|slider|tour|experience|activity/i.test(haystack)) score += 10;
    add(src, score);
  }

  return [...found.values()].sort((a, b) => b.score - a.score);
}

// TODO(simplification): every media.understory.io/experience/ <img> on an /experience/ page counts
// as the gallery, in DOM order. Ceiling: if the page ever shows other experiences' photos (related
// experiences, reviews), they join the set and shift the roles. Upgrade path: scope the search to
// the gallery section (the grid with grid-template-rows: repeat(N, 1fr)).
const UNDERSTORY_EXPERIENCE_PHOTO_RE = /^https:\/\/media\.understory\.io\/experience\//;

/**
 * An Understory experience page's own photos in page order (the gallery's main photo first), for
 * Crop's "Use full experience". Empty on any other page. The gallery is the only place an
 * experience page shows experience photos (checked 2026-10-21); og:image only fills in when the
 * gallery markup has none.
 */
export function experiencePagePhotos(page: PageData): PhotoSource[] {
  let path = "";
  try {
    path = new URL(page.url).pathname;
  } catch {
    return [];
  }
  if (!/\/experience\/[^/]+/.test(path)) return [];
  const out: PhotoSource[] = [];
  const seen = new Set<string>();
  for (const raw of [...page.imgs.map((img) => imageSource(img.attrs)), page.ogImage]) {
    const source = photoSource(raw, page.url);
    if (!source || !UNDERSTORY_EXPERIENCE_PHOTO_RE.test(source.url)) continue;
    const key = photoKey(source.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Experiences
// ---------------------------------------------------------------------------

// Price patterns across the markets Understory sells in. A number next to a
// currency mark in either order, e.g. "€149", "1.200 kr", "DKK 895", "149,-".
const PRICE_RE =
  /(?:(?:DKK|SEK|NOK|EUR|USD|GBP|CHF|kr\.?|€|\$|£)\s?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?\s?(?:kr\.?|,-|€|DKK|SEK|NOK|EUR|USD|GBP|CHF|:-))/;

// A duration is a small number (1-999, no leading zero, at most one decimal),
// optionally a range like "2-3", followed by a time unit. The lookbehind stops
// it matching inside or right after a longer digit run, such as a phone
// number or an id ("049-46.836h" once came out of a Swedish phone number).
const DURATION_RE =
  /(?<![\d.,:+()/-])(?<!\d\s)\b([1-9]\d{0,2}(?:[.,]\d)?\s?(?:-\s?[1-9]\d{0,2}(?:[.,]\d)?\s?)?(?:h|hr|hrs|hour|hours|min|mins|minutes|timer|time|tim|timmar|timme|ore|ora|horas|hora|day|days|dage|dagar|dager|giorni|días|dias))\b(?![\d.,-])/i;

const NOT_EXPERIENCE_RE =
  /^(faq|contact|about|newsletter|review|menu|cookies?|why|how|our|welcome|book|booking|gift|voucher|blog|news|terms|privacy|login|sign|follow|share|subscribe|home|search|filter|sort|popular|related|more|latest|kontakt|om os|om oss|nyheder|nyheter|anmeldelser|recensioner|chi siamo|contatti|sobre|contacto)\b/i;

export function extractPrice(text: string): string | undefined {
  const match = text.match(PRICE_RE);
  return match ? match[0].replace(/\s+/g, " ").trim() : undefined;
}

export function extractDuration(text: string): string | undefined {
  const match = text.match(DURATION_RE);
  return match ? match[0].trim() : undefined;
}

// Flatten JSON-LD into a list of objects, walking @graph, itemListElement and
// nested item/offers wrappers, since structured data nests inconsistently.
export function flattenJsonLd(nodes: JsonValue[]): JsonObject[] {
  const out: JsonObject[] = [];
  const visit = (node: JsonValue | undefined, depth: number) => {
    if (depth > 6) return;
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, depth + 1));
      return;
    }
    if (!isRecord(node)) return;
    out.push(node);
    for (const key of ["@graph", "itemListElement", "item", "mainEntity", "hasOfferCatalog"]) {
      if (key in node) visit(node[key], depth + 1);
    }
  };
  nodes.forEach((n) => visit(n, 0));
  return out;
}

const EXPERIENCE_TYPES = /^(Product|Event|TouristTrip|TouristAttraction|Course|Trip|Service|Offer|LocalBusiness)$/i;

function jsonLdExperiences(page: PageData): ExperienceCandidate[] {
  const out: ExperienceCandidate[] = [];
  for (const item of flattenJsonLd(page.jsonLd)) {
    const type = Array.isArray(item["@type"]) ? String(item["@type"][0]) : String(item["@type"] ?? "");
    if (!EXPERIENCE_TYPES.test(type) || type.toLowerCase() === "localbusiness") continue;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) continue;

    let price: string | undefined;
    const offers = item.offers;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    if (isRecord(offer)) {
      const amount = offer.price ?? offer.lowPrice;
      const currency = typeof offer.priceCurrency === "string" ? offer.priceCurrency : "";
      if (amount !== undefined && amount !== "") price = `${currency} ${amount}`.trim();
    }

    const image = item.image;
    const imageUrl =
      typeof image === "string"
        ? image
        : Array.isArray(image) && typeof image[0] === "string"
          ? image[0]
          : urlOf(image);

    const location = item.location;
    const locationName =
      typeof location === "string"
        ? location
        : isRecord(location)
          ? String(location.name ?? (isRecord(location.address) ? location.address.addressLocality : undefined) ?? "")
          : "";

    out.push({
      title: name,
      description: typeof item.description === "string" ? stripTags(item.description) : undefined,
      price,
      location: locationName || undefined,
      duration: typeof item.duration === "string" ? isoDuration(item.duration) : undefined,
      imageUrl: resolveUrl(imageUrl, page.url),
      sourceUrl: typeof item.url === "string" ? resolveUrl(item.url, page.url) : page.url,
    });
  }
  return out;
}

// "PT2H30M" -> "2.5 hours", "PT45M" -> "45 min"; anything unparseable is
// returned as written.
export function isoDuration(value: string): string {
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i);
  if (!match) return value;
  const days = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  if (days) return days === 1 ? "1 day" : `${days} days`;
  if (!minutes) return value;
  if (minutes < 60) return `${minutes} min`;
  const rounded = Math.round((minutes / 60) * 2) / 2;
  return rounded === 1 ? "1 hour" : `${rounded} hours`;
}

// Cards on listing pages: a heading with a price in the text around it. The
// window before the heading catches the card image, the window after catches
// price and blurb.
function headingExperiences(page: PageData): ExperienceCandidate[] {
  const out: ExperienceCandidate[] = [];
  const sorted = [...page.headings].sort((a, b) => a.index - b.index);

  sorted.forEach((heading, i) => {
    if (heading.level === 1) return;
    const title = heading.text;
    if (title.length < 3 || title.length > 90 || NOT_EXPERIENCE_RE.test(title)) return;
    if (PRICE_RE.test(title)) return;

    const nextIndex = sorted[i + 1]?.index ?? page.html.length;
    const after = page.html.slice(heading.end, Math.min(nextIndex, heading.end + 1800));
    const before = page.html.slice(Math.max(0, heading.index - 1200), heading.index);
    const afterText = stripTags(after);

    const price = extractPrice(afterText);
    if (!price) return;

    // First sentence-ish chunk of body text that is not the price line.
    const description = afterText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .find((s) => s.length > 30 && !PRICE_RE.test(s));

    const imgTag = [...before.matchAll(/<img\b([^<>]*)>/gi)].pop() ?? after.match(/<img\b([^<>]*)>/i);
    const imgSrc = imgTag ? imageSource(parseAttrs(imgTag[1])) : undefined;
    const imageUrl = imgSrc && !NON_PHOTO_RE.test(imgSrc) ? resolveUrl(imgSrc, page.url) : undefined;

    const linkTag = (before + after).match(/<a\b([^<>]*)>/i);
    const href = linkTag ? resolveUrl(parseAttrs(linkTag[1]).href, page.url) : undefined;

    out.push({
      title,
      description,
      price,
      duration: extractDuration(afterText),
      imageUrl,
      sourceUrl: href ?? page.url,
    });
  });

  return out;
}

// A sub-page about one experience: og data plus the first price on the page.
export function pageAsExperience(page: PageData): ExperienceCandidate | undefined {
  const title = (page.headings.find((h) => h.level === 1)?.text ?? page.title ?? "").trim();
  if (!title || title.length > 120) return undefined;
  const text = stripTags(page.html);
  const price = extractPrice(text);
  if (!price && !page.ogImage) return undefined;
  return {
    title: title.replace(/\s*[|·-]\s*[^|·-]{0,40}$/, "").trim() || title,
    description: page.description,
    price,
    duration: extractDuration(text),
    imageUrl: page.ogImage,
    sourceUrl: page.url,
  };
}

export function extractExperiences(page: PageData): ExperienceCandidate[] {
  return dedupeExperiences([...jsonLdExperiences(page), ...headingExperiences(page)]);
}

export function dedupeExperiences(list: ExperienceCandidate[]): ExperienceCandidate[] {
  const seen = new Map<string, ExperienceCandidate>();
  for (const item of list) {
    const key = item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, item);
    } else {
      // Later finds fill gaps in the first one rather than replacing it.
      seen.set(key, {
        ...existing,
        description: existing.description ?? item.description,
        price: existing.price ?? item.price,
        location: existing.location ?? item.location,
        duration: existing.duration ?? item.duration,
        imageUrl: existing.imageUrl ?? item.imageUrl,
      });
    }
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Crawl targets
// ---------------------------------------------------------------------------

const EXPERIENCE_LINK_RE =
  /(tour|experience|activit|ticket|class|course|workshop|event|product|oplevelse|upplevelse|opplevelse|aktivitet|billet|biljett|esperienz|experiencia|ruta|corsi|kurs|book|safari|adventure|tasting|cruise|trip|excursion|udflugt|utflykt)/i;

const FILE_RE = /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|docx?)(\?|$)/i;

// Internal links that look like experience listings or detail pages, best
// first: shorter paths tend to be listing pages, which give the most cards.
export function experienceLinks(page: PageData, max = 6): string[] {
  let origin: URL;
  try {
    origin = new URL(page.url);
  } catch {
    return [];
  }
  const rootHost = origin.hostname.replace(/^www\./, "");
  const scored = new Map<string, number>();

  for (const anchor of page.anchors) {
    const href = resolveUrl(anchor.attrs.href, page.url);
    if (!href || href.startsWith("data:")) continue;
    let target: URL;
    try {
      target = new URL(href);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(target.protocol)) continue;
    if (target.hostname.replace(/^www\./, "") !== rootHost) continue;
    if (FILE_RE.test(target.pathname)) continue;
    target.hash = "";
    const clean = target.toString();
    if (clean === page.url || clean === page.url + "/" || clean + "/" === page.url) continue;

    const anchorText = stripTags(page.html.slice(anchor.index, anchor.index + 300).split("</a>")[0] ?? "");
    const haystack = `${target.pathname} ${anchorText} ${anchor.attrs.title ?? ""}`;
    if (!EXPERIENCE_LINK_RE.test(haystack)) continue;

    const depth = target.pathname.split("/").filter(Boolean).length;
    const score = 10 - Math.min(depth, 5) + (EXPERIENCE_LINK_RE.test(target.pathname) ? 3 : 0);
    scored.set(clean, Math.max(scored.get(clean) ?? 0, score));
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, max);
}
