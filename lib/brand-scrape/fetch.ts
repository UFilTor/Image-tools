// Server-side fetching for the scraper and the image proxy. Both take a URL a
// user typed, so every request goes through the same guard: http(s) only and
// never an address inside our own network.
//
// Copied from ~/brand-scrape-kit. Image Tools' API routes are public, so unlike
// the kit this copy also resolves DNS on every hop (assertResolvesPublic): a
// public hostname pointing at a private address is refused.
// TODO(simplification): fetch() resolves the name again, so a DNS-rebinding
// host could still answer privately on the second lookup. Upgrade path: pin
// the resolved address with a custom undici dispatcher.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ScrapeKind } from "./types";

export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const PRIVATE_HOST_RE = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i;
// Loopback, private, link-local, CGNAT, IETF-reserved (192.0.0/24), benchmarking (198.18/15)
// and multicast/reserved (224+).
const PRIVATE_IPV4_RE =
  /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|192\.0\.0\.|198\.1[89]\.|22[4-9]\.|2[3-5]\d\.)/;

/**
 * Add https:// when the user typed a bare domain (from the kit's brand.ts). Any other scheme is
 * left as typed, so the guard answers "Only http and https" instead of looking up a host
 * called "ftp" or "file". "example.com:8080" has no "//", so it still counts as a bare domain.
 */
export function withProtocol(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^(file|data|javascript|mailto|blob|about):/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Expand an IPv6 address into its 8 groups. Handles "::" and a dotted IPv4 tail; null when it
 * is not valid IPv6.
 */
function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  const tail = s.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (tail) {
    const b = tail.slice(1).map(Number);
    if (b.some((v) => v > 255)) return null;
    s = `${s.slice(0, -tail[0].length)}${((b[0] << 8) | b[1]).toString(16)}:${((b[2] << 8) | b[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...rest];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/**
 * Loopback, private, link-local, unique-local, multicast and reserved addresses. IPv6 forms that
 * carry an IPv4 address (::ffff:a.b.c.d, ::a.b.c.d, 64:ff9b::/96) are checked as that IPv4
 * address, in any spelling: the URL parser rewrites [::ffff:127.0.0.1] to [::ffff:7f00:1], which
 * the earlier string checks let through to this machine's own server.
 */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return PRIVATE_IPV4_RE.test(ip);
  const g = ipv6Groups(ip);
  if (!g) return true; // not an address we can read: refuse
  const v4 = `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  const firstFiveZero = g.slice(0, 5).every((x) => x === 0);
  if (firstFiveZero && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0 && g[7] <= 1) return true; // :: and ::1
    return PRIVATE_IPV4_RE.test(v4);
  }
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return PRIVATE_IPV4_RE.test(v4);
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/** Resolve the host and refuse it when any of its addresses is private. */
async function assertResolvesPublic(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new Error("Couldn't find that website");
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw new Error("That address is not reachable from here");
  }
}

/**
 * Node's fetch rejects with a bare TypeError("fetch failed") when the host can't be reached
 * (connection refused, TLS failure). Callers show this instead.
 */
export function upstreamMessage(error: unknown, fallback: string): string {
  if (isFetchFailed(error)) return "Couldn't reach that website";
  if (isTimeout(error)) return "That website took too long to answer";
  return error instanceof Error ? error.message : fallback;
}

const isFetchFailed = (error: unknown) => error instanceof TypeError && /fetch failed/i.test(error.message);
const isTimeout = (error: unknown) => error instanceof Error && error.name === "AbortError";

/** The site could not be reached at all: no answer (DNS, refused, TLS) or no answer in time. */
export function isUnreachable(error: unknown): boolean {
  return isFetchFailed(error) || isTimeout(error);
}

/**
 * What a bot wall's refusal says. The photo tools follow it with the Send to Image Tools bookmark
 * (FromWebsite); the Logo tool has no bookmark, so it also gets the manual way round.
 */
export function blockedMessage(kind: ScrapeKind): string {
  const message = "That website blocks automated visitors.";
  return kind === "logo" ? `${message} Open it in your browser, save the photos, then go back and upload them.` : message;
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported");
  }
  const host = url.hostname.toLowerCase();
  const literal = host.replace(/^\[|\]$/g, "");
  if (PRIVATE_HOST_RE.test(host) || (isIP(literal) !== 0 && isPrivateAddress(literal))) {
    throw new Error("That address is not reachable from here");
  }
  return url;
}

/** A site that answered with an error status; the status tells a bot wall (403, 429) from a dead page (404). */
export class HttpError extends Error {
  constructor(public readonly status: number) {
    super(`The site answered ${status}`);
    this.name = "HttpError";
  }
}

/** Statuses a bot wall answers with: the site is up but refuses automated visitors. */
export const BLOCKED_STATUSES = new Set([401, 403, 406, 429, 503]);

export interface FetchedText {
  url: string;
  text: string;
  contentType: string;
}

const MAX_REDIRECTS = 5;

// fetch() with the address guard applied to EVERY hop. Following redirects
// automatically would let a public URL bounce the server onto a private
// address, so redirects are resolved by hand and each target is re-checked.
export async function guardedFetch(
  rawUrl: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
): Promise<{ res: Response; url: string }> {
  let url = assertPublicHttpUrl(rawUrl).toString();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertResolvesPublic(new URL(url));
    const res = await fetch(url, { ...init, redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = assertPublicHttpUrl(new URL(location, url).toString()).toString();
      continue;
    }
    return { res, url };
  }
  throw new Error("The site redirected too many times");
}

// Fetch a page or stylesheet as text with a timeout and a size cap. The final
// URL is returned so relative links resolve against the page that answered.
export async function fetchText(
  url: string,
  { timeoutMs = 8000, maxBytes = 2_000_000 }: { timeoutMs?: number; maxBytes?: number } = {}
): Promise<FetchedText> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { res, url: finalUrl } = await guardedFetch(url, {
      headers: {
        "user-agent": BROWSER_UA,
        accept: "text/html,application/xhtml+xml,text/css,*/*;q=0.8",
        "accept-language": "en,da;q=0.9,sv;q=0.8,no;q=0.7",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new HttpError(res.status);
    const buffer = await readCapped(res, maxBytes);
    const contentType = res.headers.get("content-type") ?? "";
    return { url: finalUrl, text: decodeBody(buffer, contentType), contentType };
  } finally {
    clearTimeout(timer);
  }
}

// ISO-8859-1 sites (older Danish and Norwegian operators) keep their ø and å only when the body is
// decoded with the charset they declare: the header first, then a <meta charset> in the first 4 KB.
export function decodeBody(bytes: Uint8Array, contentType: string): string {
  const fromHeader = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const fromMeta =
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    head.match(/<meta[^>]+content=["'][^"']*charset=([\w-]+)/i)?.[1];
  const label = (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    // Unknown label: UTF-8 is the least wrong guess.
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  // Only the chunks that fit were kept, so the result is exactly their size:
  // a truncated response is cut short, never padded out to the cap.
  const collected = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(collected);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
