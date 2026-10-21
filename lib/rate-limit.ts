/**
 * Best-effort per-IP rate limit so a leaked URL can't burn the API key. In-memory, so it is
 * per serverless instance; good enough to blunt abuse, not a security boundary.
 */
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

/**
 * Requests per minute per IP, one counter per route so a busy cheap route can't use up a
 * paid one's budget (or the other way round).
 */
export const RATE_LIMITS = {
  "detect-focal": 40, // Smart Crop batch analysis, under a cent each
  "logo-edit": 20, // Ask AI on the Logo page, under a cent each
  "image-edit": 10, // AI Gateway logo redraw, about $0.04 each
  scrape: 10, // fetch from a website: several outbound requests each
  "image-proxy": 300, // one scrape shows ~25 thumbnails through the proxy
} as const;

export type RateBucket = keyof typeof RATE_LIMITS;

export function rateLimited(ip: string, bucket: RateBucket): boolean {
  const max = RATE_LIMITS[bucket];
  const now = Date.now();
  const key = `${bucket}:${ip}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    // Evict only idle IPs so a flood of spoofed addresses can't reset active counters.
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] >= RATE_WINDOW_MS) hits.delete(k);
  }
  // TODO(simplification): in-memory, per serverless instance. Ceiling: N instances => N x the limit.
  // Upgrade path: edge rate limiting or a shared store (KV) if the endpoint ever becomes public.
  return recent.length > max;
}

/**
 * The caller's IP. On Vercel, x-real-ip is set by the platform and can't be spoofed, while the
 * first x-forwarded-for entry is whatever the client sent (a fresh value per request dodged the
 * limits in a break test). Off Vercel (local dev) both headers are client-controlled.
 */
export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
