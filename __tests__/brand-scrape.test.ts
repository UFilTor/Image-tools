import { describe, it, expect } from "vitest";
import {
  decodeEntities,
  experienceLinks,
  extractDuration,
  extractExperiences,
  extractLogos,
  extractPhotos,
  extractPrice,
  imageSource,
  isoDuration,
  pageAsExperience,
  parseHtml,
  experiencePagePhotos,
  unwrapOptimizer,
} from "@/lib/brand-scrape/parse";
import { assertPublicHttpUrl, isPrivateAddress, withProtocol } from "@/lib/brand-scrape/fetch";

// A small but realistic experience-operator home page: builder-style markup
// with lazy images, a brand variable in CSS, JSON-LD for one product and
// heading cards with prices for two more.
const HOME = `<!doctype html>
<html><head>
<title>Explore Copenhagen - Bike tours</title>
<meta property="og:site_name" content="Explore Copenhagen">
<meta property="og:description" content="Guided bike tours in Copenhagen.">
<meta property="og:image" content="/img/hero-bikes.jpg">
<meta name="theme-color" content="#0B5D3B">
<link rel="stylesheet" href="/css/site.css">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>
  :root { --brand-primary: #E8542F; --grey: #777777; }
  .btn { background: #e8542f; color: #fff; }
  .hero { background: rgb(232, 84, 47); }
  .muted { color: #999; }
</style>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Bike Blitz",
 "description":"A one-hour guided ride past Tivoli and the waterfront.",
 "image":"https://cdn.example.com/bike-blitz.jpg",
 "offers":{"@type":"Offer","price":"149","priceCurrency":"USD"},
 "url":"/tours/bike-blitz"}
</script>
<script>var tpl = '<img src="/not-real.jpg">';</script>
</head>
<body>
<header><a href="/"><img class="site-logo" src="/img/logo.svg" alt="Explore Copenhagen"></a>
<nav><a href="/tours">Tours</a><a href="/about">About</a><a href="/contact">Contact</a></nav></header>
<main>
<section class="cards">
  <article>
    <a href="/tours/harbour-kayak"><img data-src="/img/kayak-800.jpg" src="/img/blank.gif" width="800" height="600" alt="Kayak on the harbour"></a>
    <h3>Harbour Kayak</h3>
    <p>Paddle the canals with a guide. 2 hours on the water, all gear included.</p>
    <span class="price">From 495 kr</span>
  </article>
  <article>
    <img srcset="/img/food-400.jpg 400w, /img/food-1200.jpg 1200w" src="/img/food-400.jpg" alt="Smorrebrod tasting">
    <h3>Food Walk</h3>
    <p>Taste your way through Vesterbro over 3 hours.</p>
    <span>DKK 695</span>
  </article>
  <article>
    <h3>FAQ</h3><p>Prices from 100 kr.</p>
  </article>
</section>
<img src="/img/icons/arrow.svg" alt="">
<img src="https://tracking.example.com/pixel.gif" width="1" height="1">
</main>
</body></html>`;

describe("parseHtml", () => {
  const page = parseHtml(HOME, "https://www.explorecopenhagen.dk/");

  it("reads the meta data", () => {
    expect(page.siteName).toBe("Explore Copenhagen");
    expect(page.description).toBe("Guided bike tours in Copenhagen.");
    expect(page.ogImage).toBe("https://www.explorecopenhagen.dk/img/hero-bikes.jpg");
  });

  it("ignores markup inside scripts", () => {
    expect(page.imgs.some((t) => t.attrs.src === "/not-real.jpg")).toBe(false);
  });

  it("parses JSON-LD", () => {
    expect(page.jsonLd).toHaveLength(1);
  });
});

describe("extractLogos", () => {
  it("ranks the header logo above the touch icon and drops the tiny favicon", () => {
    const page = parseHtml(HOME, "https://www.explorecopenhagen.dk/");
    const logos = extractLogos(page);
    expect(logos[0].url).toBe("https://www.explorecopenhagen.dk/img/logo.svg");
    expect(logos.map((l) => l.url)).toContain("https://www.explorecopenhagen.dk/apple-touch-icon.png");
    const favicon = logos.find((l) => l.url.endsWith("favicon.ico"));
    expect(favicon && favicon.score < 30).toBe(true);
  });
});

describe("extractPhotos", () => {
  const page = parseHtml(HOME, "https://www.explorecopenhagen.dk/");
  const photos = extractPhotos(page);
  const urls = photos.map((p) => p.url);

  it("puts the og:image first", () => {
    expect(urls[0]).toBe("https://www.explorecopenhagen.dk/img/hero-bikes.jpg");
  });

  it("uses the lazy-load source and the largest srcset entry", () => {
    expect(urls).toContain("https://www.explorecopenhagen.dk/img/kayak-800.jpg");
    expect(urls).toContain("https://www.explorecopenhagen.dk/img/food-1200.jpg");
    expect(urls).not.toContain("https://www.explorecopenhagen.dk/img/food-400.jpg");
  });

  it("skips logos, icons, pixels and placeholders", () => {
    expect(urls.some((u) => /logo|arrow|pixel|blank/.test(u))).toBe(false);
  });
});

describe("imageSource", () => {
  it("prefers data-src over a placeholder src", () => {
    expect(imageSource({ src: "/blank.gif", "data-src": "/real.jpg" })).toBe("/real.jpg");
  });
});

describe("extractExperiences", () => {
  const page = parseHtml(HOME, "https://www.explorecopenhagen.dk/");
  const experiences = extractExperiences(page);
  const titles = experiences.map((e) => e.title);

  it("finds the JSON-LD product with its price and image", () => {
    const bike = experiences.find((e) => e.title === "Bike Blitz");
    expect(bike?.price).toBe("USD 149");
    expect(bike?.imageUrl).toBe("https://cdn.example.com/bike-blitz.jpg");
    expect(bike?.sourceUrl).toBe("https://www.explorecopenhagen.dk/tours/bike-blitz");
  });

  it("finds heading cards with a price nearby", () => {
    expect(titles).toContain("Harbour Kayak");
    expect(titles).toContain("Food Walk");
    const kayak = experiences.find((e) => e.title === "Harbour Kayak");
    expect(kayak?.price).toBe("From 495 kr".replace("From ", ""));
    expect(kayak?.imageUrl).toBe("https://www.explorecopenhagen.dk/img/kayak-800.jpg");
    expect(kayak?.description).toMatch(/Paddle the canals/);
    expect(kayak?.duration).toMatch(/hours/);
  });

  it("does not turn an FAQ heading into an experience", () => {
    expect(titles).not.toContain("FAQ");
  });
});

describe("price and duration patterns", () => {
  it("matches the formats used in our markets", () => {
    expect(extractPrice("Pris fra 1.295 kr per person")).toBe("1.295 kr");
    expect(extractPrice("ab €89,00 pro Person")).toBe("€89,00");
    expect(extractPrice("Price: DKK 695")).toBe("DKK 695");
    expect(extractPrice("Only 495:- per person")).toBe("495:-");
    expect(extractPrice("no price here")).toBeUndefined();
  });

  it("does not read a bare year as a price", () => {
    expect(extractPrice("Founded in 2019 by two friends")).toBeUndefined();
  });

  it("reads durations", () => {
    expect(extractDuration("Duration: 2.5 hours on the water")).toBe("2.5 hours");
    expect(extractDuration("Varighed 3 timer")).toBe("3 timer");
    expect(extractDuration("Ca 2-3 timmar på vattnet")).toBe("2-3 timmar");
    expect(extractDuration("Tar 90 min")).toBe("90 min");
    expect(extractDuration("Kurs 1.5h inkl. utrustning")).toBe("1.5h");
  });

  it("does not read a phone number or an id as a duration", () => {
    expect(extractDuration("Ring oss: 073-049-46.836h")).toBeUndefined();
    expect(extractDuration("Tel +46 (0)49 46 836h")).toBeUndefined();
    expect(extractDuration("Order 2026-09-09 12:30h")).toBeUndefined();
    expect(extractDuration("Art.nr 000123h")).toBeUndefined();
  });

  it("converts ISO durations", () => {
    expect(isoDuration("PT2H30M")).toBe("2.5 hours");
    expect(isoDuration("PT1H")).toBe("1 hour");
    expect(isoDuration("PT45M")).toBe("45 min");
    expect(isoDuration("PT10M")).toBe("10 min");
    expect(isoDuration("P2D")).toBe("2 days");
    expect(isoDuration("about an hour")).toBe("about an hour");
  });

  it("survives an out-of-range numeric entity", () => {
    expect(decodeEntities("a &#1114112; b &#65; &#x41;")).toBe("a &#1114112; b A A");
  });

});

describe("pageAsExperience", () => {
  it("turns a detail page into one candidate", () => {
    const detail = `<html><head><title>Harbour Kayak | Explore Copenhagen</title>
      <meta property="og:description" content="Two hours of paddling.">
      <meta property="og:image" content="https://cdn.example.com/kayak.jpg"></head>
      <body><h1>Harbour Kayak</h1><p>From 495 kr per person, 2 hours.</p></body></html>`;
    const page = parseHtml(detail, "https://www.explorecopenhagen.dk/tours/harbour-kayak");
    const exp = pageAsExperience(page);
    expect(exp?.title).toBe("Harbour Kayak");
    expect(exp?.price).toBe("495 kr");
    expect(exp?.imageUrl).toBe("https://cdn.example.com/kayak.jpg");
    expect(exp?.description).toBe("Two hours of paddling.");
  });
});

describe("experienceLinks", () => {
  it("returns internal links that look like experience pages, listings first", () => {
    const page = parseHtml(HOME, "https://www.explorecopenhagen.dk/");
    const links = experienceLinks(page);
    expect(links[0]).toBe("https://www.explorecopenhagen.dk/tours");
    expect(links).toContain("https://www.explorecopenhagen.dk/tours/harbour-kayak");
    expect(links.some((l) => /about|contact/.test(l))).toBe(false);
  });
});

describe("assertPublicHttpUrl", () => {
  it("accepts a normal site", () => {
    expect(assertPublicHttpUrl("https://www.example.com/tours").hostname).toBe("www.example.com");
  });

  it("refuses non-http schemes and private addresses", () => {
    expect(() => assertPublicHttpUrl("file:///etc/passwd")).toThrow();
    expect(() => assertPublicHttpUrl("http://localhost:3000")).toThrow();
    expect(() => assertPublicHttpUrl("http://127.0.0.1")).toThrow();
    expect(() => assertPublicHttpUrl("http://10.0.0.5")).toThrow();
    expect(() => assertPublicHttpUrl("http://192.168.1.1")).toThrow();
    expect(() => assertPublicHttpUrl("http://169.254.169.254/latest")).toThrow();
    expect(() => assertPublicHttpUrl("not a url")).toThrow();
  });
});

describe("isPrivateAddress (resolved-address guard added in Image Tools)", () => {
  it("refuses private, loopback, link-local and unique-local addresses", () => {
    for (const ip of [
      "10.0.0.5", "127.0.0.1", "169.254.169.254", "192.168.1.1", "172.20.0.1", "192.0.0.8", "198.18.0.1", "224.0.0.1",
      "::", "::1", "fd00::1", "fe80::1", "ff02::1", "::ffff:10.0.0.1",
      // The URL parser's hex spelling of mapped addresses (this let [::ffff:127.0.0.1] through)
      "::ffff:7f00:1", "::ffff:a9fe:a9fe", "0:0:0:0:0:ffff:127.0.0.1", "::7f00:1", "64:ff9b::a9fe:a9fe",
      "not-an-ip",
    ]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["76.76.21.21", "2606:4700::1111", "::ffff:8.8.8.8", "::ffff:808:808", "2001:4860:4860::8888"]) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  it("refuses IPv6 literals that wrap a private IPv4 address in the URL itself", () => {
    expect(() => assertPublicHttpUrl("http://[::ffff:127.0.0.1]:3002/")).toThrow();
    expect(() => assertPublicHttpUrl("http://[::ffff:169.254.169.254]/")).toThrow();
    expect(() => assertPublicHttpUrl("https://[2606:4700::1111]/")).not.toThrow();
  });

  it("adds https to bare domains", () => {
    expect(withProtocol(" understory.io ")).toBe("https://understory.io");
    expect(withProtocol("http://x.se")).toBe("http://x.se");
  });
});

describe("image optimizer URLs (Next.js / Vercel)", () => {
  const base = "https://shop.example.com/experience/abc";

  it("unwraps to the original image, resolving a relative one against the page", () => {
    expect(unwrapOptimizer("https://shop.example.com/_next/image?url=%2Fimg%2Fa.jpg&w=640&q=75", base)).toBe(
      "https://shop.example.com/img/a.jpg",
    );
    expect(
      unwrapOptimizer("https://shop.example.com/_vercel/image?w=750&q=75&url=https%3A%2F%2Fmedia.understory.io%2Fexperience%2F%2Fcover%2FX.false", base),
    ).toBe("https://media.understory.io/experience//cover/X.false");
    expect(unwrapOptimizer("https://cdn.example.com/photo.jpg?w=900", base)).toBe("https://cdn.example.com/photo.jpg?w=900");
  });

  it("keeps every photo a site serves through the optimizer, instead of collapsing them into one", () => {
    const html = `<img src="/_vercel/image?w=3840&q=75&url=https%3A%2F%2Fcdn.example.com%2Fa.jpg">
      <img src="/_vercel/image?w=3840&q=75&url=https%3A%2F%2Fcdn.example.com%2Fb.jpg">`;
    const urls = extractPhotos(parseHtml(html, base)).map((p) => p.url);
    expect(urls).toEqual(["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"]);
  });
});

describe("experiencePagePhotos", () => {
  const gallery = `<meta property="og:image" content="https://media.understory.io/experience//cover/MAIN.false">
    <img src="https://media.understory.io/company/c1/cover/COVER.png">
    <img srcset="/_vercel/image?w=640&url=https%3A%2F%2Fmedia.understory.io%2Fexperience%2F%2Fcover%2FMAIN.false 640w">
    <img srcset="/_vercel/image?w=640&url=https%3A%2F%2Fmedia.understory.io%2Fexperience%2F%2Fcover%2FSECOND.false 640w">
    <img srcset="/_vercel/image?w=640&url=https%3A%2F%2Fmedia.understory.io%2Fexperience%2F%2Fcover%2FTHIRD.false 640w">`;

  it("lists an experience page's own photos in page order, main photo first, once each", () => {
    const urls = experiencePagePhotos(parseHtml(gallery, "https://nos.understory.io/experience/87601ae3"));
    expect(urls.map((u) => u.split("/").pop())).toEqual(["MAIN.false", "SECOND.false", "THIRD.false"]);
  });

  it("is empty on pages that aren't experience pages", () => {
    expect(experiencePagePhotos(parseHtml(gallery, "https://nos.understory.io/en"))).toEqual([]);
  });
});
