import { NextResponse } from "next/server";
import { BROWSER_UA, guardedFetch, readCapped, upstreamMessage } from "@/lib/brand-scrape/fetch";
import { clientIp, rateLimited } from "@/lib/rate-limit";

// Same-origin proxy for scraped images. The browser draws a candidate onto a
// canvas to downscale it into a data URL, and a canvas can only read pixels
// from a same-origin image, so the bytes have to come through here.
export const runtime = "nodejs";

const MAX_BYTES = 12_000_000;

export async function GET(request: Request) {
  // A scrape shows ~20-30 thumbnails through here, so this route gets its own, larger budget.
  // Browsers mark a request from another site as cross-site; refusing it stops other pages from
  // hotlinking this proxy. TODO(simplification): scripts can omit the header, so the proxy stays
  // usable for any public image. Upgrade path: /api/scrape signs each candidate URL (HMAC) and
  // this route accepts only signed URLs.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Not available from other sites" }, { status: 403 });
  }
  if (rateLimited(clientIp(request.headers), "image-proxy")) {
    return NextResponse.json({ error: "Too many requests, slow down a little" }, { status: 429 });
  }
  const target = new URL(request.url).searchParams.get("url") ?? "";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    let origin: URL;
    try {
      origin = new URL(target);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    const { res } = await guardedFetch(target, {
      headers: {
        "user-agent": BROWSER_UA,
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        // Some CDNs refuse hotlinking; a same-site referer keeps them happy.
        referer: `${origin.protocol}//${origin.host}/`,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Image request answered ${res.status}` }, { status: 502 });
    }
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "That URL is not an image" }, { status: 415 });
    }
    const bytes = await readCapped(res, MAX_BYTES);
    return new NextResponse(bytes, {
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=3600",
        // The bytes come from someone else's site and are served from OUR
        // origin. An SVG with a <script> opened as a top-level document would
        // otherwise run against this app's localStorage. The sandbox directive
        // gives the response an opaque origin; <img> and canvas use is
        // unaffected because images never run script anyway.
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const message = upstreamMessage(error, "Could not fetch the image");
    const status = /not a valid url|only http|not reachable/i.test(message) ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  } finally {
    clearTimeout(timer);
  }
}
