import { BoundingBox, FocalResult } from "./types";
import { downscaleForAI, loadImageEl, logoForAI } from "./image-utils";
import type { PaletteColor } from "./logo-edits";
import type { LogoPromptContext } from "./logo-edit-prompt";
import { isNetworkError, userMessage } from "./errors";

let apiAvailable: boolean | null = null;

const MAX_RATE_LIMIT_RETRIES = 3;


/**
 * Whether the Claude API key is configured. Only a real answer is cached: a network failure
 * returns false for now and asks again next time, instead of hiding the AI features until a reload.
 */
export async function checkApiAvailable(): Promise<boolean> {
  if (apiAvailable !== null) return apiAvailable;
  try {
    const res = await fetch("/api/detect-focal/health");
    const data = await res.json();
    apiAvailable = data.available === true;
    return apiAvailable;
  } catch {
    return false;
  }
}

/** POST an already-downscaled payload; retries a bounded number of times on rate limits. */
async function postFocal(payload: { src: string; mime: string }, retriesLeft: number): Promise<FocalResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch("/api/detect-focal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json();

    if (!res.ok) {
      const rateLimited = data?.error?.type === "rate_limit_error" || data?.type === "rate_limit_error" || res.status === 429;
      if (rateLimited) {
        if (retriesLeft <= 0) return { bbox: null, label: "", error: "Rate limit hit, try again shortly" };
        const attempt = MAX_RATE_LIMIT_RETRIES - retriesLeft + 1;
        await new Promise((r) => setTimeout(r, attempt * 2000));
        return postFocal(payload, retriesLeft - 1);
      }
      const errMsg = typeof data?.error === "string" ? data.error : data?.error?.message || `API error (HTTP ${res.status})`;
      return { bbox: null, label: "", error: errMsg };
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function detectFocal(src: string): Promise<FocalResult> {
  try {
    // Downscale once, then reuse the payload across retries.
    const payload = await downscaleForAI(src);
    return await postFocal(payload, MAX_RATE_LIMIT_RETRIES);
  } catch (err: unknown) {
    const message = userMessage(err);
    return {
      bbox: null,
      label: "",
      error: message.includes("abort") ? "Request timed out (30s)" : message,
    };
  }
}

export async function detectFocalWithFallback(
  src: string,
  imgWidth: number,
  imgHeight: number,
): Promise<FocalResult> {
  // Try browser FaceDetector first
  if (typeof window !== "undefined" && "FaceDetector" in window) {
    try {
      // @ts-expect-error - FaceDetector is not in TypeScript types
      const detector = new window.FaceDetector();
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = src;
      });
      const faces = await detector.detect(img);
      if (faces.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
        for (const face of faces) {
          const box = face.boundingBox;
          minX = Math.min(minX, box.x);
          minY = Math.min(minY, box.y);
          maxX = Math.max(maxX, box.x + box.width);
          maxY = Math.max(maxY, box.y + box.height);
        }
        const padX = (maxX - minX) * 0.3;
        const padY = (maxY - minY) * 0.3;
        return {
          bbox: {
            x1: Math.max(0, (minX - padX) / imgWidth),
            y1: Math.max(0, (minY - padY) / imgHeight),
            x2: Math.min(1, (maxX + padX) / imgWidth),
            y2: Math.min(1, (maxY + padY) / imgHeight),
          },
          label: `${faces.length} face${faces.length > 1 ? "s" : ""} detected`,
        };
      }
    } catch {
      // FaceDetector failed, continue to next fallback
    }
  }

  // Check if API key is configured before even trying
  const hasApi = await checkApiAvailable();
  if (!hasApi) {
    return { bbox: null, label: "Center crop" };
  }

  // Try API
  return detectFocal(src);
}

export interface LogoEditResult {
  edits: { from: string; to: string; box: BoundingBox | null }[];
  /** Areas whose shapes should be removed */
  erase: BoundingBox[];
  background: "remove" | "keep" | "unchanged";
  /** Background fill: "#RRGGBB" to set, "none" to clear, null to leave as is */
  fill: string | null;
  note: string;
}

/** Ask Claude to plan a logo edit. Throws with a user-facing message on failure. */
export async function requestLogoEdit(
  canvas: HTMLCanvasElement,
  instruction: string,
  palette: PaletteColor[],
  context: LogoPromptContext,
): Promise<LogoEditResult> {
  const payload = await logoForAI(canvas);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch("/api/logo-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, instruction, palette, ...context }),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : `API error (HTTP ${res.status})`);
    return data;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("Claude took too long (60s), try again");
    if (isNetworkError(err)) throw new Error(userMessage(err));
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

let gatewayAvailable: Promise<boolean> | null = null;

/** Whether the AI Gateway is configured (logo redraw). A failed check is not cached. */
export function checkGatewayAvailable(): Promise<boolean> {
  gatewayAvailable ??= fetch("/api/image-edit/health")
    .then((r) => r.json())
    .then((d) => d.available === true)
    .catch(() => {
      gatewayAvailable = null;
      return false;
    });
  return gatewayAvailable;
}

/**
 * Send an image edit through the AI Gateway route and return the decoded result. The bytes go
 * through a short-lived object URL that is revoked once decoded (callers draw the element).
 * Throws with a user-facing message on failure.
 */
export async function requestImageEdit(form: FormData): Promise<HTMLImageElement> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch("/api/image-edit", { method: "POST", body: form, signal: controller.signal });
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) {
      const data = await res.json().catch(() => null);
      throw new Error(typeof data?.error === "string" ? data.error : `AI Gateway error (HTTP ${res.status})`);
    }
    const url = URL.createObjectURL(await res.blob());
    try {
      return await loadImageEl(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("The image model took too long (1 min), try again");
    if (isNetworkError(err)) throw new Error(userMessage(err));
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
