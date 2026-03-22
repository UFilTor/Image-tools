import { CropRect, NaturalSize, DisplaySize, MultiCropItem } from "./types";
import { cropToBlob, cropFilename } from "./image-utils";

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
