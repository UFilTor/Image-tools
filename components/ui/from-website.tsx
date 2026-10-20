"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { prepareFiles } from "@/lib/file-intake";
import type { ImageCandidate } from "@/lib/brand-scrape/types";
import { checkerBg } from "@/lib/constants";
import { userMessage } from "@/lib/errors";

interface FromWebsiteProps {
  /** Logos for the Logo tool, photos for the photo tools */
  kind: "logo" | "photo";
  multiple?: boolean;
  /** Same loader the page uses for clipboard paste */
  onFiles: (files: FileList) => void;
}

const MAX_SHOWN = { logo: 8, photo: 24 } as const;

/** Scraped images load through the same-origin proxy (the browser can't read cross-origin pixels). */
const proxied = (url: string) => `/api/image?url=${encodeURIComponent(url)}`;

function fileNameFor(url: string, index: number, type: string): string {
  let base = "";
  try {
    base = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    // keep the fallback name
  }
  base = base.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w-]+/g, "-").slice(0, 60) || `website-image-${index + 1}`;
  const ext = type.includes("svg") ? "svg" : type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
  return `${base}.${ext}`;
}

/**
 * "Or fetch from a website": paste a customer's URL, pick from the logos or photos the brand
 * scraper finds (`/api/scrape`), and load them into the tool like a paste or a drop would.
 */
export function FromWebsite({ kind, multiple = false, onFiles }: FromWebsiteProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"scrape" | "load" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ site: string; items: ImageCandidate[] } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const noun = kind === "logo" ? "logo" : "photo";

  const scrape = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy("scrape");
    setError(null);
    setFound(null);
    setPicked([]);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : `Couldn't read that website (HTTP ${res.status})`);
      const list: unknown = kind === "logo" ? data?.logos : data?.photos;
      const items = (Array.isArray(list) ? list : [])
        .filter((c): c is ImageCandidate => typeof c?.url === "string")
        .slice(0, MAX_SHOWN[kind]);
      if (!items.length) throw new Error(`No ${noun}s found on that website.`);
      const site = typeof data?.siteName === "string" && data.siteName ? data.siteName : new URL(data.url).hostname;
      setFound({ site, items });
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (u: string) =>
    setPicked((p) => (multiple ? (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]) : p[0] === u ? [] : [u]));

  const use = async () => {
    if (!picked.length || busy) return;
    setBusy("load");
    setError(null);
    try {
      const files = await Promise.all(
        picked.map(async (u, i) => {
          const res = await fetch(proxied(u));
          if (!res.ok) throw new Error("Couldn't download one of the images. Try another one.");
          const blob = await res.blob();
          return new File([blob], fileNameFor(u, i, blob.type), { type: blob.type });
        }),
      );
      const { files: ready, error: intakeError } = await prepareFiles(files);
      if (intakeError) throw new Error(intakeError);
      if (ready) onFiles(ready);
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (!open) {
    return (
      <div className="text-center mt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[13px] font-semibold text-primary underline underline-offset-4 decoration-border-hover hover:decoration-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Or fetch from a website
        </button>
        <p className="text-xs text-text-secondary mt-1">
          No file? Paste the customer&apos;s website and pick {kind === "logo" ? "their logo" : "their photos"}.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-2xl px-[22px] py-5 mt-4">
      <form onSubmit={scrape}>
        <label htmlFor={`from-website-${kind}`} className="block text-[13px] font-semibold text-text mb-2.5">
          Fetch {noun}s from a website
        </label>
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
      </div>

      {found && (
        <div className="mt-4">
          <p className="text-xs text-text-secondary mb-2">
            {found.items.length} {noun}
            {found.items.length === 1 ? "" : "s"} on {found.site}. {multiple ? "Pick one or more." : "Pick one."}
          </p>
          <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {found.items.map((c) => {
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
                      src={proxied(c.url)}
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
          <div className="flex justify-end mt-3">
            <Button type="button" variant="primary" onClick={use} disabled={!picked.length || !!busy}>
              {busy === "load"
                ? "Loading…"
                : picked.length > 1
                  ? `Use ${picked.length} ${noun}s`
                  : `Use ${noun}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
