import { describe, it, expect, vi, afterEach } from "vitest";
import {
  BOOKMARKLET_PATH,
  BOOKMARKLET_VERSION,
  bookmarkletHref,
  bookmarkletMain,
  parseSentPhotos,
  PHOTOS,
  READY,
} from "@/lib/bookmarklet";

const ORIGIN = "https://image-tools.example";

// The bookmarklet runs from its source text, so run it the same way: anything it borrowed from
// this module would be undefined here and throw.
const runFromSource = (origin: string) =>
  // SAFETY: the Function body returns bookmarkletMain's own source, so it has bookmarkletMain's signature.
  (new Function(`return (${bookmarkletMain.toString()})`)() as typeof bookmarkletMain)(origin);

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
  it("is a javascript: URL that calls the bookmarklet with this origin", () => {
    const href = bookmarkletHref(ORIGIN);
    expect(href.startsWith("javascript:")).toBe(true);
    expect(decodeURIComponent(href.slice("javascript:".length))).toContain(`(${JSON.stringify(ORIGIN)})`);
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
