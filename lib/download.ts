import { CropRect, NaturalSize, DisplaySize, MultiCropItem, CropQueueItem, UpscaleItem, UpscaleFactor } from "./types";
import { cropToBlob, cropFilename } from "./image-utils";
import { upscaleFilename } from "./upscale";

export function dlCrop(
  src: string,
  nat: NaturalSize,
  disp: DisplaySize,
  crop: CropRect,
  fname: string,
): void {
  cropToBlob(src, nat, disp, crop).then((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = fname;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

export async function dlAll(items: MultiCropItem[]): Promise<void> {
  const ready = items.filter((it) => it.status === "done" && it.crop);
  if (!ready.length) return;

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  await Promise.all(
    ready.map(async (it) => {
      try {
        const blob = await cropToBlob(it.src, it.natural, it.disp, it.crop!);
        if (blob) zip.file(cropFilename(it.name), blob);
      } catch {
        // skip individual failures
      }
    }),
  );

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.download = "crops.zip";
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function dlAllCropQueue(items: CropQueueItem[]): Promise<void> {
  if (!items.length) return;

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  await Promise.all(
    items.map(async (it) => {
      try {
        const blob = await cropToBlob(it.src, it.natural, it.disp, it.crop);
        if (blob) zip.file(cropFilename(it.name), blob);
      } catch {
        // skip individual failures
      }
    }),
  );

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.download = "crops.zip";
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download a data URL directly (used by upscale results). */
export function dlDataUrl(src: string, fname: string): void {
  const a = document.createElement("a");
  a.download = fname;
  a.href = src;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function dlAllUpscaled(items: UpscaleItem[], scale: UpscaleFactor): Promise<void> {
  const ready = items.filter((it) => it.status === "done" && it.result);
  if (!ready.length) return;

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  await Promise.all(
    ready.map(async (it) => {
      try {
        const blob = await (await fetch(it.result!)).blob();
        zip.file(upscaleFilename(it.name, scale), blob);
      } catch {
        // skip individual failures
      }
    }),
  );

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.download = "upscaled.zip";
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function dlCanvas(canvas: HTMLCanvasElement, fname: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = fname;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}
