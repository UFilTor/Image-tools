import { NextResponse } from "next/server";
import { assertPublicHttpUrl, upstreamMessage, withProtocol } from "@/lib/brand-scrape/fetch";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { scrapeWebsite } from "@/lib/brand-scrape/scrape";

// The scraper fetches a handful of pages and stylesheets in sequence groups,
// so it needs more than the default function budget.
export const maxDuration = 30;
export const runtime = "nodejs";

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
    return NextResponse.json(
      { error: upstreamMessage(error, "Could not read that website") },
      { status: 502 }
    );
  }
}
