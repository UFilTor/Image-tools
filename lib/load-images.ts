import { isAcceptedFile } from "./constants";
import { readFileAsImage, LoadedImage } from "./image-utils";

export interface LoadResult {
  /** Successfully decoded images, in input order. Empty when nothing could be read. */
  images: LoadedImage[];
  /** User-facing message: a hard failure when `images` is empty, a soft "skipped N" note otherwise. */
  error: string | null;
}

/**
 * Filter a FileList to accepted types and decode them. One implementation for every mode,
 * so the error copy and the null-filtering stay identical.
 */
export async function loadImageFiles(files: FileList | File[]): Promise<LoadResult> {
  const arr = Array.from(files).filter((f) => isAcceptedFile(f));
  if (!arr.length) return { images: [], error: null };

  const results = await Promise.all(arr.map(readFileAsImage));
  const images = results.filter((r): r is LoadedImage => r !== null);
  const failed = arr.length - images.length;

  if (!images.length) {
    return {
      images,
      error: `Couldn't read ${arr.length === 1 ? "that image" : "any of those images"}. Try a different file.`,
    };
  }
  return {
    images,
    error: failed > 0 ? `Skipped ${failed} unreadable file${failed === 1 ? "" : "s"}.` : null,
  };
}
