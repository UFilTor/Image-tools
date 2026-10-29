import { CropRect, NaturalSize, DisplaySize, MultiCropItem, CropQueueItem, UpscaleItem, UpscaleFactor, ExtendQueueItem } from "./types";
import { cropToBlob, queueCropFilename, orderedName, loadImageEl, canvasToBlob } from "./image-utils";
import { upscaleFilename } from "./upscale";
import { safeZoneForRatio, type SafeZone } from "./storefront";
import { extendGeometry, renderExtended, extendFilename, extendSizeError, ExtendFill } from "./extend-utils";
import { EXTENSION_FILES, EXTENSION_FOLDER } from "./bookmarklet";

export interface DownloadResult {
  ok: boolean;
  error?: string;
}

const FAIL: DownloadResult = { ok: false, error: "Couldn't prepare that download. Try again." };

/** Click an anchor for a blob and revoke the URL afterwards. */
function triggerDownload(blob: Blob, fname: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.download = fname;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|svg|bmp|tiff?|heic)$/i;
const EXT_FOR_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/**
 * A downloaded original's file name: the name in its URL, with the extension of what the server
 * actually sent (a CDN may serve WebP for a .jpg address), or the URL's own when the type is unknown.
 */
export function originalName(url: string, type: string, index = 0): string {
  let base = "";
  try {
    base = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    // keep the fallback name
  }
  base = base.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 100) || `image-${index + 1}`;
  const typeExt = EXT_FOR_TYPE[type];
  const urlExt = base.match(IMAGE_EXT)?.[1].toLowerCase().replace("jpeg", "jpg");
  if (urlExt && (!typeExt || urlExt === typeExt)) return base;
  return urlExt ? base.replace(IMAGE_EXT, `.${typeExt}`) : `${base}.${typeExt ?? "jpg"}`;
}

/** Make repeated names unique: the second "a.jpg" becomes "a-2.jpg", skipping names already taken. */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = name.replace(/(\.[^.]+)?$/, (ext) => `-${n}${ext}`);
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/**
 * Download images exactly as their sites serve them: one on its own, several as one zip. JSZip
 * stores files uncompressed by default, so each file in the zip is byte-identical too.
 */
export async function dlOriginals(
  sources: { url: string; blob: () => Promise<Blob> }[],
  zipName: string,
): Promise<DownloadResult> {
  if (!sources.length) return { ok: false, error: "Nothing to download yet." };
  const loaded = await Promise.all(sources.map((s) => s.blob().then((blob) => ({ url: s.url, blob }), () => null)));
  const ok = loaded.filter((l): l is { url: string; blob: Blob } => l !== null);
  if (!ok.length) return { ok: false, error: "Couldn't download those images. Try again." };
  const names = uniqueNames(ok.map((l, i) => originalName(l.url, l.blob.type, i)));
  const skipped = sources.length - ok.length;
  const note = skipped ? `Skipped ${skipped} image${skipped === 1 ? "" : "s"} that couldn't be downloaded.` : undefined;
  if (ok.length === 1) {
    triggerDownload(ok[0].blob, names[0]);
    return { ok: true, error: note };
  }
  const result = await zipAndDownload(ok.map((l, i) => ({ name: names[i], blob: async () => l.blob })), zipName);
  return result.ok && note ? { ok: true, error: note } : result;
}

/**
 * The Send to Image Tools extension as one zip, for "Get the extension". Every file must load, or
 * the unzipped extension wouldn't run, so a missing one fails the whole download.
 */
export async function dlExtension(): Promise<DownloadResult> {
  try {
    const files = await Promise.all(
      EXTENSION_FILES.map(async (name) => {
        // Revalidate: after a deploy the zip must hold the new files, not a cached copy.
        const res = await fetch(`/extension/${name}`, { cache: "no-cache" });
        if (!res.ok) throw new Error(`${name} (HTTP ${res.status})`);
        return { name: `${EXTENSION_FOLDER}/${name}`, blob: await res.blob() };
      }),
    );
    return zipAndDownload(files.map((f) => ({ name: f.name, blob: async () => f.blob })), `${EXTENSION_FOLDER}.zip`);
  } catch (err) {
    return { ok: false, error: `Couldn't download the extension: ${err instanceof Error ? err.message : "try again"}.` };
  }
}

/** Download a URL (blob or data) as-is. */
export function dlUrl(src: string, fname: string): void {
  const a = document.createElement("a");
  a.download = fname;
  a.href = src;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Zip a set of async-produced blobs and download the archive. Entries that fail are skipped;
 * the result reports how many made it so callers can tell the user.
 */
async function zipAndDownload(
  entries: { name: string; blob: () => Promise<Blob | null> }[],
  zipName: string,
): Promise<DownloadResult> {
  if (!entries.length) return { ok: false, error: "Nothing to download yet." };
  try {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    let added = 0;
    await Promise.all(
      entries.map(async (e) => {
        try {
          const blob = await e.blob();
          if (blob) {
            zip.file(e.name, blob);
            added++;
          }
        } catch {
          // skip individual failures, reported below
        }
      }),
    );
    if (!added) return FAIL;
    const zipBlob = await zip.generateAsync({ type: "blob" });
    triggerDownload(zipBlob, zipName);
    const skipped = entries.length - added;
    return skipped ? { ok: true, error: `Skipped ${skipped} image${skipped === 1 ? "" : "s"} that couldn't be exported.` } : { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.message ? `Download failed: ${err.message}` : FAIL.error };
  }
}

export async function dlCrop(
  src: string,
  nat: NaturalSize,
  disp: DisplaySize,
  crop: CropRect,
  fname: string,
): Promise<DownloadResult> {
  const blob = await cropToBlob(src, nat, disp, crop);
  if (!blob) return FAIL;
  triggerDownload(blob, fname);
  return { ok: true };
}

export function dlAll(items: MultiCropItem[]): Promise<DownloadResult> {
  // Index before filtering, so names keep each photo's page position.
  const ready = items.map((it, i) => ({ it, i })).filter(({ it }) => it.status === "done" && it.crop);
  return zipAndDownload(
    ready.map(({ it, i }) => ({
      name: queueCropFilename(it.name, i, it.preset?.role),
      blob: () => cropToBlob(it.src, it.natural, it.disp, it.crop!),
    })),
    "crops.zip",
  );
}

export function dlAllCropQueue(items: CropQueueItem[]): Promise<DownloadResult> {
  return zipAndDownload(
    items.map((it, i) => ({ name: queueCropFilename(it.name, i, it.preset?.role), blob: () => cropToBlob(it.src, it.natural, it.disp, it.crop) })),
    "crops.zip",
  );
}

export function dlAllUpscaled(items: UpscaleItem[], scale: UpscaleFactor): Promise<DownloadResult> {
  const ready = items.filter((it) => it.status === "done" && it.result);
  return zipAndDownload(
    ready.map((it) => ({
      name: upscaleFilename(it.name, scale, it.mode),
      blob: async () => (await fetch(it.result!)).blob(),
    })),
    "upscaled.zip",
  );
}

/** The full-resolution Extend result as a PNG; throws the size limit as user-facing copy. */
export async function extendedBlob(
  item: ExtendQueueItem,
  ratio: number | null,
  padding: number,
  fill: ExtendFill,
  safe: SafeZone | null = null,
): Promise<Blob> {
  const geo = extendGeometry(item.natural, ratio, padding, safe);
  const sizeErr = extendSizeError(geo);
  if (sizeErr) throw new Error(sizeErr);
  const img = await loadImageEl(item.src);
  return canvasToBlob(renderExtended(img, geo, fill));
}

export async function dlExtended(
  item: ExtendQueueItem,
  ratio: number | null,
  padding: number,
  fill: ExtendFill,
  safe: SafeZone | null = null,
  fileName = extendFilename(item.name),
): Promise<DownloadResult> {
  const sizeErr = extendSizeError(extendGeometry(item.natural, ratio, padding, safe));
  if (sizeErr) return { ok: false, error: sizeErr };
  try {
    const blob = await extendedBlob(item, ratio, padding, fill, safe);
    if (!blob) return FAIL;
    triggerDownload(blob, fileName);
    return { ok: true };
  } catch {
    return FAIL;
  }
}

/** One photo in Extend's Download all: its file name, the shape it's extended to, and its safe zone. */
export interface ExtendDownloadEntry {
  item: ExtendQueueItem;
  name: string;
  ratio: number | null;
  safe: SafeZone | null;
}

/**
 * What Extend's Download all writes. Each photo is extended at its own shape in Full experience
 * (the batch `ratio` otherwise), named in page order, and "Fit inside safe zone" uses that shape's
 * safe zone. Pure, so it is tested without a canvas.
 */
export function extendDownloadPlan(items: ExtendQueueItem[], ratio: number | null, fitSafe: boolean): ExtendDownloadEntry[] {
  return items.map((item, i) => {
    const r = item.preset ? item.preset.value : ratio;
    return {
      item,
      name: orderedName(extendFilename(item.name), i, item.preset?.role),
      ratio: r,
      safe: fitSafe ? safeZoneForRatio(r) : null,
    };
  });
}

/** Every Extend result in one zip, as planned by extendDownloadPlan. */
export function dlAllExtended(
  items: ExtendQueueItem[],
  ratio: number | null,
  padding: number,
  fill: ExtendFill,
  fitSafe = false,
): Promise<DownloadResult> {
  return zipAndDownload(
    extendDownloadPlan(items, ratio, fitSafe).map((p) => ({
      name: p.name,
      // A size-limit throw skips that entry, like any other failed render.
      blob: () => extendedBlob(p.item, p.ratio, padding, fill, p.safe),
    })),
    "extended.zip",
  );
}

export function dlCanvas(canvas: HTMLCanvasElement, fname: string): Promise<DownloadResult> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(FAIL);
        return;
      }
      triggerDownload(blob, fname);
      resolve({ ok: true });
    }, "image/png");
  });
}
