import { CropRect, NaturalSize, DisplaySize, MultiCropItem, CropQueueItem, UpscaleItem, UpscaleFactor, ExtendQueueItem } from "./types";
import { cropToBlob, queueCropFilename, orderedName, loadImageEl, canvasToBlob } from "./image-utils";
import { upscaleFilename } from "./upscale";
import { safeZoneForRatio, type SafeZone } from "./storefront";
import { extendGeometry, renderExtended, extendFilename, extendSizeError, ExtendFill } from "./extend-utils";

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
