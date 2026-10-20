import { describe, it, expect } from "vitest";
import { parseHtml } from "@/lib/brand-scrape/parse";

// Hostile pages: unclosed tags repeated until the page is ~200 KB. Regexes that rescan to the
// end of the page for every opener turn these quadratic (8.6 s for "<img " x 40k in review).
const PATTERNS = ["<img ", "<!--", "<script>", "<style>", "<noscript>", "<h2>", "<title>", "<a "];

describe("parseHtml on hostile pages", () => {
  for (const p of PATTERNS) {
    it(`parses 200 KB of "${p}" quickly`, () => {
      const html = "<!doctype html>" + p.repeat(Math.ceil(200_000 / p.length));
      const t0 = performance.now();
      parseHtml(html, "https://evil.example/");
      expect(performance.now() - t0).toBeLessThan(400);
    });
  }
});
