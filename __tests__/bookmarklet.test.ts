import { describe, it, expect, vi, afterEach } from "vitest";
import {
  acceptsPhotos,
  BOOKMARKLET_PATH,
  BOOKMARKLET_VERSION,
  bookmarkletHref,
  bookmarkletMain,
  collectPhotoUrls,
  collectVideos,
  parseSentPhotos,
  PHOTOS,
  READY,
} from "@/lib/bookmarklet";

const ORIGIN = "https://image-tools.example";

// The bookmarklet runs from its source text, so run it the same way: anything it or the collector
// borrowed from this module would be undefined here and throw.
const runFromSource = (origin: string) => {
  // SAFETY: each Function body returns that function's own source, so it keeps that function's signature.
  const main = new Function(`return (${bookmarkletMain.toString()})`)() as typeof bookmarkletMain;
  // SAFETY: as above, for the collector.
  const collect = new Function(`return (${collectPhotoUrls.toString()})`)() as typeof collectPhotoUrls;
  main(origin, collect);
};

function img(src: string, { w = 0, h = 0, srcset = "", alt = "" } = {}) {
  const el = document.createElement("img");
  el.src = src;
  if (srcset) el.srcset = srcset;
  el.alt = alt;
  Object.defineProperty(el, "naturalWidth", { value: w });
  Object.defineProperty(el, "naturalHeight", { value: h });
  document.body.appendChild(el);
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("bookmarkletHref", () => {
  it("is a javascript: URL that calls the bookmarklet with this origin and the collector", () => {
    const href = bookmarkletHref(ORIGIN);
    expect(href.startsWith("javascript:")).toBe(true);
    const code = decodeURIComponent(href.slice("javascript:".length));
    expect(code).toContain(`(${JSON.stringify(ORIGIN)}, ${collectPhotoUrls.toString()})`);
    expect(() => new Function(code)).not.toThrow();
  });

  it("repeats the path, message types and version the receiver listens for", () => {
    const source = bookmarkletMain.toString();
    for (const literal of [BOOKMARKLET_PATH, READY, PHOTOS, `version: ${BOOKMARKLET_VERSION},`]) expect(source).toContain(literal);
  });
});

describe("bookmarkletMain", () => {
  it("opens Image Tools and sends the page's photos, skipping icons, logos and profile pictures", async () => {
    img("/photos/hero.jpg", { w: 1600, h: 900 });
    img("/photos/thumb.jpg", { w: 150, h: 150, srcset: "/photos/thumb.jpg 150w, /photos/thumb-1080.jpg 1080w" });
    img("/img/small.jpg", { w: 64, h: 64 });
    img("/assets/logo-dark.png", { w: 800, h: 400 });
    img("/p/me.jpg", { w: 500, h: 500, alt: "kulturkepsen's profile picture" });
    img("/img/diagram.svg", { w: 900, h: 900 });
    img("/uploads/iconic-sunset.jpg", { w: 1200, h: 800 });

    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    // SAFETY: an iframe appended to the document always has a content window.
    const win = frame.contentWindow as Window;
    const post = vi.spyOn(win, "postMessage").mockImplementation(() => {});
    const open = vi.spyOn(window, "open").mockReturnValue(win);
    // A plain reply, not Node's Response: its Blob class is not the page's (jsdom's) Blob.
    const jpeg = { ok: true, blob: async () => new Blob(["x"], { type: "image/jpeg" }) };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.endsWith("hero.jpg") ? jpeg : Promise.reject(new TypeError("CORS")))),
    );

    runFromSource(ORIGIN);
    expect(open).toHaveBeenCalledWith(`${ORIGIN}${BOOKMARKLET_PATH}`, "_blank");

    // A message from anywhere but the opened tab is ignored.
    window.dispatchEvent(new MessageEvent("message", { source: window, origin: ORIGIN, data: { type: READY } }));
    window.dispatchEvent(new MessageEvent("message", { source: win, origin: ORIGIN, data: { type: READY } }));
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    const [message, target] = post.mock.calls[0];
    expect(target).toBe(ORIGIN);
    const sent = parseSentPhotos(message);
    expect(sent?.version).toBe(BOOKMARKLET_VERSION);
    // Ordered by area; "iconic" is a word of its own, not the chrome word "icon".
    expect(sent?.photos.map((p) => new URL(p.url).pathname)).toEqual([
      "/photos/hero.jpg",
      "/uploads/iconic-sunset.jpg",
      "/photos/thumb-1080.jpg",
    ]);
    expect(sent?.photos[0].blob).toBeInstanceOf(Blob);
    expect(sent?.photos[1].blob).toBeUndefined();
  });

  it("says so and opens nothing when the page has no large photos", () => {
    img("/img/small.jpg", { w: 64, h: 64 });
    const alert = vi.fn();
    vi.stubGlobal("alert", alert);
    const open = vi.spyOn(window, "open");
    runFromSource(ORIGIN);
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("No large photos"));
    expect(open).not.toHaveBeenCalled();
  });
});

describe("collectPhotoUrls", () => {
  const paths = (urls: string[]) => urls.map((u) => new URL(u).pathname);

  it("finds lazy-loaded photos whose real address still waits in a data attribute, but not theme words", () => {
    // Loaded 1x1 placeholder with the photo in data-src, as lazysizes and WordPress do it.
    img("data:image/gif;base64,R0lGODlhAQABAAAAACw=", { w: 1, h: 1 });
    document.body.lastElementChild?.setAttribute("data-src", "/uploads/lazy-hero.jpg");
    document.body.insertAdjacentHTML(
      "beforeend",
      `<picture><source data-srcset="/uploads/pic-800.webp 800w, /uploads/pic-1600.webp 1600w"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></picture>
       <div data-bg="url('/uploads/banner.jpg')"></div><div data-background="dark"></div><div data-bg="/uploads/strip.webp"></div>`,
    );
    expect(paths(collectPhotoUrls()).sort()).toEqual(["/uploads/banner.jpg", "/uploads/lazy-hero.jpg", "/uploads/pic-1600.webp", "/uploads/strip.webp"]);
  });

  it("keeps logos and SVGs and follows page order for the picker", () => {
    img("/photos/b-small.jpg", { w: 400, h: 300 });
    img("/assets/logo.png", { w: 800, h: 400 });
    img("/img/diagram.svg", { w: 900, h: 900 });
    img("/photos/a-large.jpg", { w: 2000, h: 1500 });
    expect(paths(collectPhotoUrls())).toEqual(["/photos/a-large.jpg", "/photos/b-small.jpg"]);
    expect(paths(collectPhotoUrls({ everything: true, order: "page", minSide: 0 }))).toEqual([
      "/photos/b-small.jpg",
      "/assets/logo.png",
      "/img/diagram.svg",
      "/photos/a-large.jpg",
    ]);
  });
});

describe("collectVideos", () => {
  it("finds videos that play from one file, in page order, and counts the streamed ones", () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<video src="/media/hero.mp4" poster="/media/hero-poster.jpg"></video>
       <video><source src="/media/tour.webm" type="video/webm"><source src="/media/tour.mp4"></video>
       <video src="blob:https://www.instagram.com/5f2c"></video>
       <video><source src="/live/stream.m3u8"></video>
       <video data-src="/media/lazy.mp4"></video>
       <meta property="og:video" content="https://cdn.x/share.mp4">
       <meta property="og:video:url" content="https://www.youtube.com/embed/abc123">`,
    );
    const { videos, streams } = collectVideos();
    expect(videos.map((v) => new URL(v.url).pathname)).toEqual(["/media/hero.mp4", "/media/tour.webm", "/media/lazy.mp4", "/share.mp4"]);
    expect(videos[0].poster).toMatch(/\/media\/hero-poster\.jpg$/);
    expect(videos[1].poster).toBeUndefined();
    expect(streams).toBe(2);
  });
});

describe("acceptsPhotos", () => {
  it("takes the bookmarklet's photos only from the opener, and the extension's only from the tab itself", () => {
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    // SAFETY: an iframe appended to the document always has a content window.
    const opener = frame.contentWindow as Window;
    const tab = { opener, self: window, origin: "https://tools.x" };
    expect(acceptsPhotos("bookmarklet", { source: opener, origin: "https://site.x" }, tab)).toBe(true);
    expect(acceptsPhotos("bookmarklet", { source: window, origin: "https://tools.x" }, tab)).toBe(false);
    expect(acceptsPhotos("bookmarklet", { source: null, origin: "https://site.x" }, { ...tab, opener: null })).toBe(false);
    expect(acceptsPhotos("extension", { source: window, origin: "https://tools.x" }, tab)).toBe(true);
    expect(acceptsPhotos("extension", { source: window, origin: "https://evil.x" }, tab)).toBe(false);
    expect(acceptsPhotos("extension", { source: opener, origin: "https://tools.x" }, tab)).toBe(false);
    expect(acceptsPhotos(null, { source: opener, origin: "https://site.x" }, tab)).toBe(false);
  });
});

describe("parseSentPhotos", () => {
  it("keeps http(s) photos and image bytes, and drops everything else", () => {
    const sent = parseSentPhotos({
      type: PHOTOS,
      page: "https://www.instagram.com/kulturkepsen/",
      photos: [
        { url: "https://cdn.x/a.jpg", blob: new Blob(["a"], { type: "image/jpeg" }) },
        { url: "https://cdn.x/b.jpg", blob: new Blob(["<html>"], { type: "text/html" }) },
        { url: "javascript:alert(1)" },
        { nope: true },
      ],
    });
    expect(sent?.photos).toHaveLength(2);
    expect(sent?.photos[0].blob).toBeInstanceOf(Blob);
    expect(sent?.photos[1].blob).toBeUndefined();
  });

  it("tells the extension from the bookmark, and treats anything else as the bookmark", () => {
    expect(parseSentPhotos({ type: PHOTOS, via: "extension", page: "https://x.se/", photos: [] })?.via).toBe("extension");
    expect(parseSentPhotos({ type: PHOTOS, page: "https://x.se/", photos: [] })?.via).toBe("bookmark");
    expect(parseSentPhotos({ type: PHOTOS, via: "other", page: "https://x.se/", photos: [] })?.via).toBe("bookmark");
  });

  it("counts a bookmark from before versions existed as version 0", () => {
    expect(parseSentPhotos({ type: PHOTOS, page: "https://x.se/", photos: [] })?.version).toBe(0);
    expect(parseSentPhotos({ type: PHOTOS, version: 3, page: "https://x.se/", photos: [] })?.version).toBe(3);
  });

  it("ignores messages that are not the photos message", () => {
    expect(parseSentPhotos({ type: READY })).toBeNull();
    expect(parseSentPhotos({ type: PHOTOS, page: 1, photos: [] })).toBeNull();
    expect(parseSentPhotos(null)).toBeNull();
  });
});
