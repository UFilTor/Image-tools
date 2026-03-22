import { FocalResult } from "./types";

export async function detectFocal(src: string, mime: string): Promise<FocalResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch("/api/detect-focal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src, mime }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await res.json();

    if (!res.ok) {
      if (data?.error?.type === "rate_limit_error" || data?.type === "rate_limit_error") {
        return retryWithBackoff(src, mime, 3);
      }
      const errMsg = typeof data?.error === "string" ? data.error : data?.error?.message || `API error (HTTP ${res.status})`;
      return {
        bbox: null,
        label: "",
        error: errMsg,
      };
    }

    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      bbox: null,
      label: "",
      error: message.includes("abort") ? "Request timed out (30s)" : message,
    };
  }
}

export async function detectFocalWithFallback(
  src: string,
  mime: string,
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
        // Find bounding box containing all faces
        let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
        for (const face of faces) {
          const box = face.boundingBox;
          minX = Math.min(minX, box.x);
          minY = Math.min(minY, box.y);
          maxX = Math.max(maxX, box.x + box.width);
          maxY = Math.max(maxY, box.y + box.height);
        }
        // Add 15% padding
        const padX = (maxX - minX) * 0.15;
        const padY = (maxY - minY) * 0.15;
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
      // FaceDetector failed, continue to API fallback
    }
  }

  // Try API
  const result = await detectFocal(src, mime);

  // If API key not configured, return null bbox (triggers center crop) without error
  if (result.error && (
    result.error.includes("ANTHROPIC_API_KEY not configured") ||
    result.error.includes("API error (HTTP 500)") ||
    result.error.includes("Failed to fetch") ||
    result.error.includes("NetworkError")
  )) {
    return { bbox: null, label: "Center crop", error: undefined };
  }

  return result;
}

async function retryWithBackoff(
  src: string,
  mime: string,
  retriesLeft: number,
): Promise<FocalResult> {
  if (retriesLeft <= 0) {
    return { bbox: null, label: "", error: "Rate limit hit, try again shortly" };
  }
  const delay = (4 - retriesLeft) * 2000;
  await new Promise((r) => setTimeout(r, delay));
  return detectFocal(src, mime);
}
