const HEIC_EXTENSIONS = [".heic", ".heif"];
const HEIC_MIMES = ["image/heic", "image/heif"];

/** Check if a file is HEIC/HEIF by MIME type or extension (some browsers report empty MIME for HEIC) */
export function isHeicFile(file: File): boolean {
  if (HEIC_MIMES.includes(file.type)) return true;
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return HEIC_EXTENSIONS.includes(ext);
}

/** Convert a single HEIC file to JPEG. Returns a new File with .jpg extension and image/jpeg type. */
async function convertOne(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 }) as Blob;
  const baseName = file.name.replace(/\.(heic|heif)$/i, "");
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

/**
 * Process an array of files: convert any HEIC/HEIF to JPEG, pass others through.
 * Returns a FileList-compatible DataTransfer.files.
 */
export async function convertHeicFiles(files: File[]): Promise<FileList> {
  const dt = new DataTransfer();
  for (const file of files) {
    if (isHeicFile(file)) {
      dt.items.add(await convertOne(file));
    } else {
      dt.items.add(file);
    }
  }
  return dt.files;
}
