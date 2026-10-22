import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { experienceLinks, extractLogos, extractPhotos, parseHtml } from "@/lib/brand-scrape/parse";

// Captures of real operator sites (scripts stripped, nothing else touched), copied from
// ~/brand-scrape-kit v3, one per builder that broke the parser at some point. Numbers are floors:
// the sites change, the captures do not, so a heuristic change that loses photos on real markup
// fails here.
const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "fixtures", "scrape", `${name}.html`), "utf8");

// The capture holds no <img> at all (the photos are rendered by scripts, which were stripped),
// so it only checks the logo and that the crawl still finds the rental page. The kit's v3 crawl
// words (ture, udlejning) are not ported, so the other pages are not expected here.
describe("WordPress with WPBakery (Kayak Republic)", () => {
  const page = parseHtml(fixture("kayakrepublic"), "https://kayakrepublic.dk/");

  it("finds the logo in the JSON-LD organisation", () => {
    expect(extractLogos(page)[0]?.url).toMatch(/kayak-republic-logo/);
  });

  it("crawls at least the course page", () => {
    expect(experienceLinks(page, 6)).toContain("https://kayakrepublic.dk/kurser/");
  });

  it("offers no photo rather than the logo", () => {
    expect(extractPhotos(page)).toEqual([]);
  });
});

describe("Next.js with an image CDN (GoBoat)", () => {
  const page = parseHtml(fixture("goboat"), "https://www.goboat.dk/");

  it("reads the largest srcset entry despite commas in the query (was 1 photo before parseSrcset)", () => {
    const photos = extractPhotos(page).map((p) => p.url);
    expect(photos.length).toBeGreaterThanOrEqual(25);
    expect(photos.some((u) => /ik\.imagekit\.io.*tr=w-3840,q=75/.test(u))).toBe(true);
    expect(photos.some((u) => /^https:\/\/www\.goboat\.dk\/q=75/.test(u))).toBe(false);
  });
});

describe("Squarespace (Fjordsafari)", () => {
  const page = parseHtml(fixture("fjordsafari"), "https://www.fjordsafari.no/");

  it("finds photos, one per media file", () => {
    const photos = extractPhotos(page);
    expect(photos.length).toBeGreaterThanOrEqual(25);
    const names = photos.map((p) => p.url.split("?")[0].split("/").pop());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("Hand-built Next.js site (Copenhagen Food Tours)", () => {
  const page = parseHtml(fixture("copenhagenfoodtours"), "https://www.copenhagenfoodtours.com/");

  it("ranks the preloaded hero first", () => {
    expect(extractPhotos(page)[0]?.url).toBe("https://www.copenhagenfoodtours.com/images/hero-market.jpg");
  });
});
