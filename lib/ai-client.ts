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
      if (data?.error?.type === "rate_limit_error") {
        return retryWithBackoff(src, mime, 3);
      }
      return {
        bbox: null,
        label: "",
        error: data?.error?.message || `API error (HTTP ${res.status})`,
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
