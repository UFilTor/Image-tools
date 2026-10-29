import type { ExperienceCandidate, ImageCandidate, ScrapeResult } from "./types";
import { fetchText } from "./fetch";
import { pageClues } from "../scrape-log";
import {
  dedupeExperiences,
  experienceLinks,
  experiencePagePhotos,
  extractExperiences,
  extractLogos,
  extractPhotos,
  pageAsExperience,
  parseHtml,
  photoKey,
  photoSource,
} from "./parse";

// Reads one website and returns logo and photo candidates. Experiences (title,
// price, duration, image) are still found, but only to add their photos. Fetches the home page and up to MAX_SUBPAGES
// likely experience pages. Server-side only (uses fetch with a size cap).
// Image Tools copy: the kit's colour ranking and its stylesheet fetches are
// removed, since nothing here reads colours.
const MAX_SUBPAGES = 6;
const MAX_PHOTOS = 24;
const MAX_EXPERIENCES = 12;

export async function scrapeWebsite(url: string): Promise<ScrapeResult> {
  const main = await fetchText(url);
  if (!/html/i.test(main.contentType) && !/^\s*<!doctype html|<html/i.test(main.text)) {
    throw new Error("That address did not return a web page");
  }
  const page = parseHtml(main.text, main.url);
  let pagesFetched = 1;

  const subPages = await Promise.all(
    experienceLinks(page, MAX_SUBPAGES).map((href) =>
      fetchText(href, { timeoutMs: 6000, maxBytes: 1_500_000 })
        .then((r) => parseHtml(r.text, r.url))
        .catch(() => null)
    )
  );

  const photos = new Map<string, ImageCandidate>();
  const addPhotos = (list: ImageCandidate[]) => {
    for (const photo of list) {
      const key = photoKey(photo.url);
      const existing = photos.get(key);
      const fallbackUrl = photo.fallbackUrl ?? existing?.fallbackUrl;
      if (!existing || existing.score < photo.score) photos.set(key, fallbackUrl ? { ...photo, fallbackUrl } : photo);
      // A lower-scored copy of the same photo can still bring the optimized URL the kept one lacks.
      else if (!existing.fallbackUrl && fallbackUrl) photos.set(key, { ...existing, fallbackUrl });
    }
  };
  addPhotos(extractPhotos(page));

  let experiences: ExperienceCandidate[] = extractExperiences(page);
  const logos = extractLogos(page);

  for (const sub of subPages) {
    if (!sub) continue;
    pagesFetched += 1;
    // Sub-page photos rank below the home page's so the hero images stay first.
    addPhotos(extractPhotos(sub, -15));
    experiences.push(...extractExperiences(sub));
    const asOne = pageAsExperience(sub);
    if (asOne) experiences.push(asOne);
    // A sub-page may carry a cleaner logo reference than the home page.
    for (const logo of extractLogos(sub)) {
      if (!logos.some((l) => l.url === logo.url)) logos.push({ ...logo, score: logo.score - 10 });
    }
  }

  experiences = dedupeExperiences(experiences)
    // Candidates with a photo or a price are far more useful in a mockup.
    .sort((a, b) => Number(Boolean(b.imageUrl)) + Number(Boolean(b.price)) - (Number(Boolean(a.imageUrl)) + Number(Boolean(a.price))))
    .slice(0, MAX_EXPERIENCES);

  // Experience photos are worth offering as photos too.
  for (const exp of experiences) {
    const source = photoSource(exp.imageUrl, main.url);
    if (!source) continue;
    const key = photoKey(source.url);
    const existing = photos.get(key);
    if (!existing) photos.set(key, { ...source, alt: exp.title, score: 70 });
    else if (!existing.fallbackUrl && source.fallbackUrl) photos.set(key, { ...existing, fallbackUrl: source.fallbackUrl });
  }

  return {
    url: main.url,
    siteName: page.siteName ?? page.title,
    description: page.description,
    logos: logos.sort((a, b) => b.score - a.score).slice(0, 8),
    photos: [...photos.values()].sort((a, b) => b.score - a.score).slice(0, MAX_PHOTOS),
    experiencePhotos: experiencePagePhotos(page),
    pagesFetched,
    clues: pageClues(page),
  };
}
