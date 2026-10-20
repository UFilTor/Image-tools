/**
 * Shared Anthropic plumbing for the API routes: one place for the model ID, headers and image
 * limits. Raw fetch (no SDK), matching the rest of the app. Server-side only.
 */

export const CLAUDE_MODEL = "claude-sonnet-5-5";
export const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
/** Abort upstream calls before the 60s function limit, so the client gets a handled error. */
export const UPSTREAM_TIMEOUT_MS = 45_000;

export const isTimeout = (err: unknown) => err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");

/** Image types the Messages API accepts inline. */
export const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
/** Anthropic's inline-image cap is 5 MB decoded; base64 is ~4/3 of that. */
export const MAX_B64_LENGTH = Math.ceil((5 * 1024 * 1024 * 4) / 3);

export function claudeHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    // Server-side refusal fallback; pairs with `fallbacks: "default"` in the request body.
    "anthropic-beta": "server-side-fallback-2026-07-01",
  };
}
