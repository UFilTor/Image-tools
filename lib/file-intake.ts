import { isAcceptedFile, MAX_FILE_SIZE, MAX_FILE_SIZE_MB, ACCEPTED_FORMATS_LABEL } from "./constants";
import { convertHeicFiles, isHeicFile } from "./heic-convert";
import { convertSvgFiles, isSvgFile } from "./svg-convert";

export interface IntakeResult {
  files: FileList | null;
  error: string | null;
  /** True when HEIC or SVG conversion is needed (callers can show a "Converting…" state). */
  converting: boolean;
}

/** Validate type and size for every file. Returns the first problem as user-facing copy. */
export function validateFiles(files: FileList | File[]): string | null {
  for (const file of Array.from(files)) {
    if (!isAcceptedFile(file)) {
      return `Unsupported format: ${file.name}. Use ${ACCEPTED_FORMATS_LABEL}.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `${file.name} exceeds ${MAX_FILE_SIZE_MB}MB limit.`;
    }
  }
  return null;
}

export function needsConversion(files: FileList | File[]): boolean {
  const arr = Array.from(files);
  return arr.some(isHeicFile) || arr.some(isSvgFile);
}

/**
 * Validate and, where needed, convert HEIC/SVG files into browser-decodable ones.
 * Shared by the drop zones and clipboard paste so the rules and error copy match.
 */
export async function prepareFiles(files: FileList | File[]): Promise<{ files: FileList | null; error: string | null }> {
  const err = validateFiles(files);
  if (err) return { files: null, error: err };

  const arr = Array.from(files);
  const needsHeic = arr.some(isHeicFile);
  const needsSvg = arr.some(isSvgFile);
  if (!needsHeic && !needsSvg) return { files: toFileList(arr), error: null };

  try {
    let out: FileList = toFileList(arr);
    if (needsHeic) out = await convertHeicFiles(Array.from(out));
    if (needsSvg) out = await convertSvgFiles(Array.from(out));
    return { files: out, error: null };
  } catch {
    return {
      files: null,
      error: needsHeic ? "Failed to convert HEIC file. Try converting it to JPG first." : "Failed to convert SVG file.",
    };
  }
}

export function toFileList(arr: File[]): FileList {
  const dt = new DataTransfer();
  arr.forEach((f) => dt.items.add(f));
  return dt.files;
}
