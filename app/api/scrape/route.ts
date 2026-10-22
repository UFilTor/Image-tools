import { NextResponse } from "next/server";
import { assertPublicHttpUrl, BLOCKED_STATUSES, HttpError, upstreamMessage, withProtocol } from "@/lib/brand-scrape/fetch";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { scrapeWebsite } from "@/lib/brand-scrape/scrape";

// The scraper fetches a handful of pages and stylesheets in sequence groups,
// so it needs more than the default function budget.
export const maxDuration = 30;
export const runtime = "nodejs";

// Not exported: a route file may only export handlers and config.
const BLOCKED_MESSAGE =
  "That website blocks automated visitors. Open it in your browser, save the photos, then go back and upload them.";

export async function POST(request: Request) {
  if (rateLimited(clientIp(request.headers), "scrape")) {
    return NextResponse.json({ error: "Too many requests, slow down a little" }, { status: 429 });
  }
  let url: string;
  try {
    // Parse at the boundary: anything but { url: string } (including a `null` body) is a 400.
    const body: unknown = await request.json().catch(() => null);
    const raw = typeof body === "object" && body !== null && "url" in body ? body.url : undefined;
    if (typeof raw !== "string") throw new Error("Send { url } as JSON");
    url = withProtocol(raw);
    assertPublicHttpUrl(url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await scrapeWebsite(url));
  } catch (error) {
    // A bot wall answers 403 or 429 to every server-side visitor; no retry will get past it, so
    // the message points at the way that works. Any other status (404, 500) is reported as such.
    if (error instanceof HttpError && BLOCKED_STATUSES.has(error.status)) {
      return NextResponse.json({ error: BLOCKED_MESSAGE, code: "blocked" }, { status: 502 });
    }
    return NextResponse.json(
      { error: upstreamMessage(error, "Could not read that website") },
      { status: 502 }
    );
  }
}
