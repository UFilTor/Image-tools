// "Fetch from a website" misses, one row each in a Google Sheet, so they can be reviewed and the
// scraper taught new site patterns. The sheet's Apps Script (scripts/scrape-log-sheet.gs) appends
// the row; the weekly scrape-fixes task reads it back. Nothing is sent unless SCRAPE_LOG_URL is set
// (Production only), so local and preview fetches never log.

import { BLOCKED_STATUSES, HttpError, isUnreachable } from "./brand-scrape/fetch";
import type { PageData } from "./brand-scrape/parse";
import type { ScrapeKind, ScrapeResult } from "./brand-scrape/types";

/** At most this many photos counts as a miss: the last three scraper fixes were sites that returned 1. */
export const FEW_PHOTOS = 2;

export type ScrapeOutcome =
  | "blocked"
  | "http-error"
  | "network"
  | "error"
  | "zero-photos"
  | "few-photos"
  | "zero-logos";

/** One sheet row, in column order. Empty strings leave a cell blank. */
export interface ScrapeLogRow {
  timestamp: string;
  urlEntered: string;
  finalUrl: string;
  outcome: ScrapeOutcome;
  siteStatus: number | "";
  message: string;
  photos: number | "";
  logos: number | "";
  clues: string;
  appVersion: string;
  pasteForClaude: string;
}

const PLATFORMS: [string, RegExp][] = [
  ["WordPress", /\/wp-content\/|\/wp-includes\//i],
  ["Wix", /wixstatic\.com/i],
  ["Squarespace", /squarespace(-cdn)?\.com/i],
  ["Shopify", /cdn\.shopify\.com/i],
  ["Webflow", /data-wf-page|website-files\.com/i],
  ["Framer", /framerusercontent\.com/i],
  ["Next.js", /__NEXT_DATA__|\/_next\/static\//],
];

/** What the scraper saw on the page, so a miss can be diagnosed from the row alone. */
export function pageClues(page: PageData): string {
  const platform = PLATFORMS.find(([, re]) => re.test(page.html))?.[0] ?? "unknown";
  const images = page.imgs.length + page.sources.length + page.backgrounds.length + page.preloadImages.length;
  return [
    `${Math.round(page.html.length / 1024)} KB HTML`,
    `${page.imgs.length} <img>`,
    `${page.sources.length} <picture> sources`,
    `${page.backgrounds.length} CSS backgrounds`,
    `${page.preloadImages.length} preloads`,
    `og:image ${page.ogImage ? "yes" : "no"}`,
    `platform ${platform}`,
    ...(images === 0 ? ["no images in the HTML (likely loaded by JavaScript)"] : []),
    `title "${page.title ?? ""}"`,
  ].join(" · ");
}

const appVersion = () => process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

function withPaste(row: Omit<ScrapeLogRow, "pasteForClaude">): ScrapeLogRow {
  const counts = row.photos === "" ? "" : `; ${row.photos} photos, ${row.logos} logos found`;
  const task =
    row.outcome === "blocked"
      ? "The site refused the live server. Check whether it also fails on localhost; if it works there it is a bot wall, not a parser bug."
      : "Reproduce with POST /api/scrape on localhost, save the page as a fixture in __tests__/fixtures/scrape/, fix lib/brand-scrape/ and add a photo-count floor test.";
  const pasteForClaude = [
    `Image Tools "Fetch from a website" miss at ${row.timestamp}`,
    `URL entered: ${row.urlEntered}`,
    `Final URL: ${row.finalUrl || "(none)"}`,
    `Outcome: ${row.outcome}${row.siteStatus === "" ? "" : ` (site answered ${row.siteStatus})`}${counts}`,
    `Message shown: ${row.message || "(none, the found images were shown)"}`,
    ...(row.clues ? [`Page clues: ${row.clues}`] : []),
    `App version: ${row.appVersion}`,
    `Task: ${task}`,
  ].join(" | ");
  return { ...row, pasteForClaude };
}

/**
 * The row for a scrape that worked but found too little, or null when it found enough. The Photo
 * tools miss at FEW_PHOTOS or fewer photos; the Logo tool only at zero logos (it ignores photos).
 */
export function resultLogRow(urlEntered: string, kind: ScrapeKind, result: ScrapeResult, now = new Date()): ScrapeLogRow | null {
  const photos = Math.max(result.photos.length, result.experiencePhotos.length);
  const logos = result.logos.length;
  let outcome: ScrapeOutcome;
  if (kind === "logo") {
    if (logos > 0) return null;
    outcome = "zero-logos";
  } else if (photos === 0) outcome = "zero-photos";
  else if (photos <= FEW_PHOTOS) outcome = "few-photos";
  else return null;
  return withPaste({
    timestamp: now.toISOString(),
    urlEntered,
    finalUrl: result.url,
    outcome,
    siteStatus: 200,
    // The same copy FromWebsite shows when the list is empty.
    message: (kind === "logo" ? logos : photos) === 0 ? `No ${kind}s found on that website.` : "",
    photos,
    logos,
    clues: result.clues ?? "",
    appVersion: appVersion(),
  });
}

/** The row for a scrape that threw, with the message the user was shown. */
export function errorLogRow(urlEntered: string, error: unknown, message: string, now = new Date()): ScrapeLogRow {
  const status = error instanceof HttpError ? error.status : "";
  const outcome: ScrapeOutcome =
    error instanceof HttpError
      ? BLOCKED_STATUSES.has(error.status) ? "blocked" : "http-error"
      : isUnreachable(error) ? "network" : "error";
  return withPaste({
    timestamp: now.toISOString(),
    urlEntered,
    finalUrl: "",
    outcome,
    siteStatus: status,
    message,
    photos: "",
    logos: "",
    clues: "",
    appVersion: appVersion(),
  });
}

/**
 * Append the row through the sheet's Apps Script. Runs inside next/server `after()`, once the user
 * has their answer, so a throw here only reaches the Vercel logs and never the fetch itself.
 */
export async function sendScrapeLog(row: ScrapeLogRow): Promise<void> {
  const url = process.env.SCRAPE_LOG_URL;
  if (!url) return;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: process.env.SCRAPE_LOG_SECRET ?? "", row }),
    signal: AbortSignal.timeout(10_000),
  });
  const reply: unknown = await res.json().catch(() => null);
  if (!res.ok || typeof reply !== "object" || reply === null || !("ok" in reply) || reply.ok !== true) {
    throw new Error(`Scrape log not written (HTTP ${res.status}): ${JSON.stringify(reply)}`);
  }
}
