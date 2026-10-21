// Types for the brand scrape kit. Image Tools copy: only what the scraper returns.

// A candidate the scraper found. Only URLs and text: nothing is downloaded until
// the user picks it.
export interface ImageCandidate {
  url: string;
  alt?: string;
  // Higher is a better guess. Used for ordering only.
  score: number;
}

export interface ExperienceCandidate {
  title: string;
  description?: string;
  price?: string;
  location?: string;
  duration?: string;
  imageUrl?: string;
  // Page it was found on, for the "open" link in the picker.
  sourceUrl?: string;
}

// Everything the scraper returns for one website. Persisted with the proposal
// so the picker still offers the same candidates after a reload.
export interface ScrapeResult {
  url: string;
  siteName?: string;
  description?: string;
  logos: ImageCandidate[];
  photos: ImageCandidate[];
  // On an Understory experience page: that experience's photos in page order, main photo first.
  experiencePhotos: string[];
  // Pages that were fetched, for the status line in the configurator.
  pagesFetched: number;
}
