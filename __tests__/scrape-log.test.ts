import { describe, it, expect, vi, afterEach } from "vitest";
import { errorLogRow, pageClues, resultLogRow, sendScrapeLog, type ScrapeLogRow } from "@/lib/scrape-log";
import { blockedMessage, HttpError } from "@/lib/brand-scrape/fetch";
import { parseHtml } from "@/lib/brand-scrape/parse";
import type { ScrapeResult } from "@/lib/brand-scrape/types";

const NOW = new Date("2026-10-29T08:00:00Z");
const photo = (n: number) => ({ url: `https://x.se/p${n}.jpg`, score: 50 });
const result = (photos: number, logos = 1): ScrapeResult => ({
  url: "https://x.se/",
  logos: Array.from({ length: logos }, (_, i) => ({ url: `https://x.se/logo${i}.png`, score: 50 })),
  photos: Array.from({ length: photos }, (_, i) => photo(i)),
  experiencePhotos: [],
  pagesFetched: 1,
  clues: "26 KB HTML",
});

describe("resultLogRow", () => {
  it("logs zero photos with the message the photo tools show", () => {
    const row = resultLogRow("x.se", "photo", result(0), NOW);
    expect(row?.outcome).toBe("zero-photos");
    expect(row?.message).toBe("No photos found on that website.");
    expect(row?.timestamp).toBe("2026-10-29T08:00:00.000Z");
  });

  it("logs 1-2 photos as a partial miss, with no message since the photos were shown", () => {
    expect(resultLogRow("x.se", "photo", result(1), NOW)?.outcome).toBe("few-photos");
    const row = resultLogRow("x.se", "photo", result(2), NOW);
    expect(row?.outcome).toBe("few-photos");
    expect(row?.message).toBe("");
    expect(row?.photos).toBe(2);
  });

  it("logs nothing from 3 photos up", () => {
    expect(resultLogRow("x.se", "photo", result(3), NOW)).toBeNull();
    expect(resultLogRow("x.se", "photo", result(24), NOW)).toBeNull();
  });

  it("counts an experience page's photos when the general list is shorter", () => {
    const r = { ...result(1), experiencePhotos: [photo(1), photo(2), photo(3)] };
    expect(resultLogRow("x.se", "photo", r, NOW)).toBeNull();
  });

  it("logs the Logo tool only when no logo is found, whatever the photo count", () => {
    expect(resultLogRow("x.se", "logo", result(0, 1), NOW)).toBeNull();
    const row = resultLogRow("x.se", "logo", result(10, 0), NOW);
    expect(row?.outcome).toBe("zero-logos");
    expect(row?.message).toBe("No logos found on that website.");
  });
});

describe("errorLogRow", () => {
  it("tells a bot wall from a dead page by the site's status", () => {
    const blocked = errorLogRow("brandstar.se", new HttpError(403), "blocked copy", NOW);
    expect(blocked.outcome).toBe("blocked");
    expect(blocked.siteStatus).toBe(403);
    expect(blocked.message).toBe("blocked copy");
    expect(errorLogRow("x.se", new HttpError(404), "m", NOW).outcome).toBe("http-error");
  });

  it("calls an unreachable site or a timeout a network miss, anything else an error", () => {
    expect(errorLogRow("x.se", new TypeError("fetch failed"), "m", NOW).outcome).toBe("network");
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(errorLogRow("x.se", abort, "m", NOW).outcome).toBe("network");
    expect(errorLogRow("x.se", new Error("That address did not return a web page"), "m", NOW).outcome).toBe("error");
  });
});

describe("pasteForClaude", () => {
  it("holds every fact a chat needs on one line, so pasting a cell keeps no quotes", () => {
    // SAFETY: one photo is a few-photos miss, so resultLogRow returns a row, not null.
    const row = resultLogRow("x.se", "photo", result(1), NOW) as ScrapeLogRow;
    expect(row.pasteForClaude).not.toContain("\n");
    for (const part of ["x.se", "https://x.se/", "few-photos", "1 photos, 1 logos", "26 KB HTML", "App version:", "__tests__/fixtures/scrape/"]) {
      expect(row.pasteForClaude).toContain(part);
    }
  });

  it("asks for a localhost check, not a parser fix, when the site blocked the live server", () => {
    const row = errorLogRow("brandstar.se", new HttpError(403), "m", NOW);
    expect(row.pasteForClaude).toContain("site answered 403");
    expect(row.pasteForClaude).toContain("bot wall");
  });
});

describe("pageClues", () => {
  it("names the platform and counts each kind of image source", () => {
    const html = `<html><head><title>Hands &amp; Clay</title></head><body>
      <img src="/wp-content/uploads/a.jpg"><img src="/wp-content/uploads/b.jpg">
      <div style="background-image:url('/wp-content/uploads/c.jpg')"></div></body></html>`;
    const clues = pageClues(parseHtml(html, "https://x.se/"));
    expect(clues).toContain("2 <img>");
    expect(clues).toContain("1 CSS backgrounds");
    expect(clues).toContain("platform WordPress");
    expect(clues).toContain('title "Hands & Clay"');
    expect(clues).not.toContain("loaded by JavaScript");
  });

  it("flags a page with no images in its HTML as a JavaScript app", () => {
    expect(pageClues(parseHtml("<html><body><div id=root></div></body></html>", "https://x.se/"))).toContain("loaded by JavaScript");
  });
});

describe("sendScrapeLog", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const row = errorLogRow("x.se", new HttpError(403), "m", NOW);

  it("sends nothing without SCRAPE_LOG_URL, so local and preview fetches never log", async () => {
    vi.stubEnv("SCRAPE_LOG_URL", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await sendScrapeLog(row);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts the secret and the row, and throws when the sheet does not confirm", async () => {
    vi.stubEnv("SCRAPE_LOG_URL", "https://script.google.com/macros/s/abc/exec");
    vi.stubEnv("SCRAPE_LOG_SECRET", "s3cret");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetcher);
    await sendScrapeLog(row);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toEqual({ secret: "s3cret", row });

    fetcher.mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "bad secret" })));
    await expect(sendScrapeLog(row)).rejects.toThrow("bad secret");
  });
});

describe("blockedMessage", () => {
  it("leaves the photo tools room for the bookmark, and gives the Logo tool the manual way", () => {
    expect(blockedMessage("photo")).toBe("That website blocks automated visitors.");
    expect(blockedMessage("logo")).toBe(
      "That website blocks automated visitors. Open it in your browser, save the photos, then go back and upload them.",
    );
  });
});
