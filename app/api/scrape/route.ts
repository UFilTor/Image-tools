import { after, NextResponse } from "next/server";
import {
  assertPublicHttpUrl,
  BLOCKED_STATUSES,
  blockedMessage,
  HttpError,
  upstreamMessage,
  withProtocol,
} from "@/lib/brand-scrape/fetch";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { scrapeWebsite } from "@/lib/brand-scrape/scrape";
import type { ScrapeKind } from "@/lib/brand-scrape/types";
import { errorLogRow, resultLogRow, sendScrapeLog } from "@/lib/scrape-log";

// The scraper fetches a handful of pages and stylesheets in sequence groups,
// so it needs more than the default function budget.
export const maxDuration = 30;
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (rateLimited(clientIp(request.headers), "scrape")) {
    return NextResponse.json({ error: "Too many requests, slow down a little" }, { status: 429 });
  }
  let url: string;
  let kind: ScrapeKind;
  try {
    // Parse at the boundary: anything but { url: string } (including a `null` body) is a 400.
    const body: unknown = await request.json().catch(() => null);
    const raw = typeof body === "object" && body !== null && "url" in body ? body.url : undefined;
    if (typeof raw !== "string") throw new Error("Send { url } as JSON");
    // Which tool asked: the Logo tool only misses when no logo is found. Older clients send none.
    kind = typeof body === "object" && body !== null && "kind" in body && body.kind === "logo" ? "logo" : "photo";
    url = withProtocol(raw);
    assertPublicHttpUrl(url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 }
    );
  }

  // Misses go to the scrape log sheet after the answer is sent (lib/scrape-log.ts).
  try {
    const result = await scrapeWebsite(url);
    const row = resultLogRow(url, kind, result);
    if (row) after(() => sendScrapeLog(row));
    return NextResponse.json(result);
  } catch (error) {
    // A bot wall answers 403 or 429 to every server-side visitor; no retry will get past it, so
    // the message points at the way that works. Any other status (404, 500) is reported as such.
    const blocked = error instanceof HttpError && BLOCKED_STATUSES.has(error.status);
    const message = blocked ? blockedMessage(kind) : upstreamMessage(error, "Could not read that website");
    after(() => sendScrapeLog(errorLogRow(url, error, message)));
    return NextResponse.json(blocked ? { error: message, code: "blocked" } : { error: message }, { status: 502 });
  }
}
