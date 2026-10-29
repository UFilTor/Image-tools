"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { prepareFiles } from "@/lib/file-intake";
import type { ImageCandidate, PhotoSource, ScrapeKind } from "@/lib/brand-scrape/types";
import { fetchPhoto, proxiedImage } from "@/lib/website-image";
import { dlOriginals, originalName } from "@/lib/download";
import { ExtensionDownloadButton, ExtensionInstall } from "@/components/ui/extension-install";
import { useDownload } from "@/hooks/use-download";
import { bookmarkletHref } from "@/lib/bookmarklet";
import { setWebsiteImport, useWebsiteImport, type FoundPhoto, type WebsiteImport } from "@/hooks/use-website-import";
import { FETCH_KEY, checkerBg } from "@/lib/constants";
import { isPlainShortcut } from "@/lib/keyboard";
import { KeyboardHint } from "@/components/ui/keyboard-hint";
import { userMessage } from "@/lib/errors";

interface FromWebsiteProps {
  /** Logos for the Logo tool, photos for the photo tools */
  kind: ScrapeKind;
  multiple?: boolean;
  /** Same loader the page uses for clipboard paste */
  onFiles: (files: FileList) => void;
  /** On an Understory experience page: load all its photos in page order as a Full experience */
  onExperience?: (files: FileList) => void;
  /** The page's other upload options (drop zones). Hidden while fetching, so only the found images show. */
  children?: ReactNode;
}

const MAX_SHOWN = { logo: 8, photo: 24 } as const;



/** The "Send to Image Tools" bookmarklet, to drag to the bookmarks bar. React blocks javascript: hrefs, so the ref sets it. */
function BookmarkletLink() {
  const setHref = useCallback((a: HTMLAnchorElement | null) => {
    a?.setAttribute("href", bookmarkletHref(window.location.origin));
  }, []);
  return (
    <a
      ref={setHref}
      onClick={(e) => e.preventDefault()}
      title="Drag this to your bookmarks bar"
      className="inline-block mx-0.5 px-2 py-0.5 rounded-md border border-primary bg-primary-bg font-semibold text-primary cursor-grab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      Send to Image Tools
    </a>
  );
}

/**
 * "Fetch from a website" (a full-width button under the drop zones): paste a customer's URL, pick
 * from the logos or photos the brand scraper finds (`/api/scrape`), and load them into the tool
 * like a paste or a drop would.
 */
export function FromWebsite({ kind, multiple = false, onFiles, onExperience, children }: FromWebsiteProps) {
  const [open, setOpen] = useState(false);

  // Key 7 opens it, after the cards' 1-6 (and the same key in tools without cards).
  useEffect(() => {
    if (open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== FETCH_KEY || !isPlainShortcut(e)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"scrape" | "load" | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The site's bot wall refused the server: the photo tools offer the bookmarklet instead of a plain error. */
  const [blocked, setBlocked] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [found, setFound] = useState<{ site: string; items: FoundPhoto[]; experience: PhotoSource[] } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  /** Originals whose thumbnail failed (too big for the proxy, say): those show the optimized copy. */
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const noun = kind === "logo" ? "logo" : "photo";
  const download = useDownload();

  // Photos the bookmarklet sent open this panel with them, until a fetch or Back sets them aside.
  const imported = useWebsiteImport();
  const offered = kind === "photo" ? imported : null;
  const [setAside, setSetAside] = useState<WebsiteImport | null>(null);
  const fromBookmark = offered && offered !== setAside && !found ? offered : null;
  const shown = found ?? (fromBookmark ? { ...fromBookmark, experience: [] } : null);
  const isOpen = open || !!fromBookmark;

  const scrape = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setSetAside(offered);
    setBusy("scrape");
    setError(null);
    setBlocked(null);
    setFound(null);
    setPicked([]);
    setBroken(new Set());
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, kind }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok && data?.code === "blocked" && kind === "photo" && typeof data.error === "string") {
        setBlocked(data.error);
        return;
      }
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : `Couldn't read that website (HTTP ${res.status})`);
      const list: unknown = kind === "logo" ? data?.logos : data?.photos;
      const items = (Array.isArray(list) ? list : [])
        .filter((c): c is ImageCandidate => typeof c?.url === "string")
        .slice(0, MAX_SHOWN[kind]);
      if (!items.length) throw new Error(`No ${noun}s found on that website.`);
      const site = typeof data?.siteName === "string" && data.siteName ? data.siteName : new URL(data.url).hostname;
      const expList: unknown = data?.experiencePhotos;
      const experience = (Array.isArray(expList) ? expList : [])
        .filter((p): p is PhotoSource => typeof p?.url === "string")
        .map((p) => (typeof p.fallbackUrl === "string" ? { url: p.url, fallbackUrl: p.fallbackUrl } : { url: p.url }));
      setFound({ site, items, experience });
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (u: string) =>
    setPicked((p) => (multiple ? (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]) : p[0] === u ? [] : [u]));

  /**
   * A found image's bytes: through the proxy (optimized copy if an original fails), or from its
   * object URL when the bookmarklet or extension sent the bytes along.
   */
  const sourceBlob = (source: PhotoSource & { localUrl?: string }): Promise<Blob> =>
    source.localUrl ? fetch(source.localUrl).then((r) => r.blob()) : fetchPhoto(source);

  const pickedSources = () => (shown ? picked.map((u) => shown.items.find((c) => c.url === u) ?? { url: u }) : []);

  /** Download the picked images unchanged: one file, or a zip named after the site. */
  const downloadOriginals = () =>
    download.run(() =>
      dlOriginals(
        // The original only: no fallback to the site's smaller copy, so a failure counts as skipped.
        pickedSources().map((source) => ({ url: source.url, blob: () => sourceBlob({ url: source.url, localUrl: "localUrl" in source ? source.localUrl : undefined }) })),
        `${(shown?.site ?? "website").replace(/[^\w.-]+/g, "-")}.zip`,
      ),
    );

  /** Load `sources` in order and hand them to `deliver`, like a paste or a drop. */
  const loadSources = async (sources: (PhotoSource & { localUrl?: string })[], deliver: (files: FileList) => void) => {
    if (!sources.length || busy) return;
    setBusy("load");
    setError(null);
    try {
      const files = await Promise.all(
        sources.map(async (source, i) => {
          const blob = await sourceBlob(source);
          return new File([blob], originalName(source.url, blob.type, i), { type: blob.type });
        }),
      );
      const { files: ready, error: intakeError } = await prepareFiles(files);
      if (intakeError) throw new Error(intakeError);
      if (ready) deliver(ready);
      // Used once: later upload screens open on their drop zones again, not on these photos.
      if (fromBookmark) setWebsiteImport(null);
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setBusy(null);
    }
  };

  // Arc and Dia don't run bookmarklets: wherever the bookmark is offered, the extension is too.
  const getExtension = (
    <>
      Using Arc or Dia?{" "}
      <button
        type="button"
        aria-expanded={showInstall}
        onClick={() => setShowInstall((v) => !v)}
        className="font-semibold text-primary underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Get the extension
      </button>
    </>
  );
  const installBox = showInstall && (
    <div className="mt-3 rounded-xl border border-border bg-primary-bg px-3.5 py-3">
      <ExtensionInstall />
    </div>
  );

  if (!isOpen) {
    return (
      <>
        {children}
        {/* As wide as the cards above it; a solid border, since it isn't a drop target */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-keyshortcuts={FETCH_KEY}
          className="
            relative block w-full max-w-[662px] mx-auto mt-3 rounded-2xl border-[1.5px] border-border bg-surface px-7 py-3.5 text-center cursor-pointer
            transition-[background-color,border-color] duration-200 hover:border-primary hover:bg-primary-bg
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg
          "
        >
          <span className="absolute top-2.5 right-2.5 hidden sm:inline-flex">
            <KeyboardHint shortcut={FETCH_KEY} />
          </span>
          <span className="block font-display uppercase font-bold text-[16px] text-primary tracking-[0.02em] leading-none">
            Fetch from a website
          </span>
          <span className="block text-[12px] text-text-muted mt-1.5">
            No file? Paste the customer&apos;s website and pick {kind === "logo" ? "their logo" : "their photos"}.
          </span>
        </button>
      </>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-2xl px-[22px] pt-5 mt-4">
      <form onSubmit={scrape}>
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <label htmlFor={`from-website-${kind}`} className="text-[13px] font-semibold text-text">
            Fetch {noun}s from a website
          </label>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setSetAside(offered);
            }}
            className="text-[13px] font-semibold text-text-secondary hover:text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            ← Back
          </button>
        </div>
        <div className="flex gap-2">
          <input
            id={`from-website-${kind}`}
            name="website"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="customer-website.com…"
            disabled={!!busy}
            autoFocus
            className="flex-1 min-w-0 min-h-11 bg-surface border border-border rounded-button text-text text-[16px] md:text-[14px] px-3 outline-none focus:border-border-focus disabled:opacity-60"
          />
          <Button type="submit" variant="primary" disabled={!!busy}>
            {busy === "scrape" ? "Reading…" : "Fetch"}
          </Button>
        </div>
      </form>

      <div aria-live="polite">
        {busy === "scrape" && <p className="text-xs text-text-secondary mt-2">Reading the website. This takes a few seconds.</p>}
        {error && <p className="text-xs text-error font-medium mt-2" role="alert">{error}</p>}
        {blocked && (
          <>
            <p className="text-xs text-error font-medium mt-2 leading-relaxed" role="alert">
              {blocked} Drag <BookmarkletLink /> to your bookmarks bar. Then open the site and click the bookmark.{" "}
              {getExtension}
            </p>
            {installBox}
          </>
        )}
      </div>

      {shown && (
        <div className="mt-4">
          {fromBookmark?.outdated && (
            <p className="text-xs text-text rounded-xl border-[1.5px] border-primary bg-primary-bg px-3.5 py-3 mb-3 leading-relaxed">
              {fromBookmark.via === "extension" ? (
                <>
                  <span className="font-semibold">Your Send to Image Tools extension is out of date.</span> Download the new
                  version, replace the old folder with it, then click reload on the extension in{" "}
                  <code className="px-1 rounded bg-surface-alt">chrome://extensions</code>.
                  <span className="block mt-2">
                    <ExtensionDownloadButton label="Download the new version" />
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold">Your Send to Image Tools bookmark is out of date.</span> Drag{" "}
                  <BookmarkletLink /> to your bookmarks bar again, then delete the old bookmark.
                </>
              )}
            </p>
          )}
          {onExperience && shown.experience.length > 0 && (
            <p className="text-xs text-text rounded-xl border-[1.5px] border-primary bg-primary-bg px-3.5 py-3 mb-3">
              <span className="font-semibold">Experience page with {shown.experience.length} photo{shown.experience.length === 1 ? "" : "s"}.</span>{" "}
              Use full experience crops them all at once: the main photo and the secondary photos, in page order.
            </p>
          )}
          <p className="text-xs text-text-secondary mb-2">
            {shown.items.length} {noun}
            {shown.items.length === 1 ? "" : "s"} on {shown.site}. {multiple ? "Pick one or more." : "Pick one."}
          </p>
          <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {shown.items.map((c) => {
              const on = picked.includes(c.url);
              return (
                <li key={c.url}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={c.alt ? `Pick ${c.alt}` : `Pick ${noun}`}
                    onClick={() => toggle(c.url)}
                    className={`w-full aspect-square rounded-xl border-[1.5px] overflow-hidden flex items-center justify-center p-1.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      on ? "border-primary ring-2 ring-primary" : "border-border hover:border-border-hover"
                    }`}
                    style={{ background: checkerBg(12) }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- proxied third-party images, not optimizable */}
                    <img
                      src={c.localUrl ?? proxiedImage(broken.has(c.url) && c.fallbackUrl ? c.fallbackUrl : c.url)}
                      onError={() => c.fallbackUrl && !broken.has(c.url) && setBroken((b) => new Set(b).add(c.url))}
                      alt=""
                      loading="lazy"
                      className={`max-w-full max-h-full ${kind === "photo" ? "w-full h-full object-cover rounded-lg" : "object-contain"}`}
                      draggable={false}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {shown ? (
        // Sticky: the way on stays in view while scrolling a long grid.
        <div className="sticky bottom-0 z-10 -mx-[22px] mt-4 px-[22px] py-3 bg-surface border-t border-border rounded-b-2xl shadow-[0_-6px_16px_rgba(2,44,18,0.06)] flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-secondary mr-auto tabular-nums" aria-live="polite">
            {picked.length
              ? `${picked.length} ${noun}${picked.length === 1 ? "" : "s"} picked`
              : multiple ? `Pick one or more ${noun}s` : `Pick a ${noun}`}
          </span>
          {onExperience && shown.experience.length > 0 && (
            <Button type="button" onClick={() => loadSources(shown.experience, onExperience)} disabled={!!busy}>
              Use full experience ({shown.experience.length})
            </Button>
          )}
          <Button type="button" onClick={downloadOriginals} disabled={!picked.length || !!busy || download.busy}>
            {download.busy ? "Preparing…" : "Download originals"}
          </Button>
          <Button type="button" variant="primary" onClick={() => loadSources(pickedSources(), onFiles)} disabled={!picked.length || !!busy}>
            {busy === "load"
              ? "Loading…"
              : picked.length > 1
                ? `Use ${picked.length} ${noun}s`
                : `Use ${noun}`}
          </Button>
          {download.error && (
            <p className="w-full text-xs text-error font-medium" role="alert">
              {download.error}
            </p>
          )}
        </div>
      ) : kind === "photo" && !blocked ? (
        // For sites the server can't read: the bookmarklet runs in the user's own browser instead.
        <div className="mt-3 pb-5">
          <p className="text-xs text-text-secondary leading-relaxed">
            Site blocked, or photos missing? Drag <BookmarkletLink /> to your bookmarks bar. Then open the site and click the
            bookmark. {getExtension}
          </p>
          {installBox}
        </div>
      ) : (
        <div className="pb-5" />
      )}
    </div>
  );
}
