/**
 * Vercel AI Gateway image edits (OpenAI-compatible `/v1/images/edits`), raw fetch like
 * `lib/claude.ts`. Server-side only.
 *
 * Auth: AI_GATEWAY_API_KEY, or the project's OIDC token. Inside Vercel Functions that token
 * only arrives on the request, as the x-vercel-oidc-token header (the env var exists in builds
 * and local dev only); reading just the env var left the features hidden in production.
 * Locally, `vercel env pull` writes a VERCEL_OIDC_TOKEN that expires after 12 hours.
 *
 * Model (tested 2026-10-20 on the team's free-tier credits):
 * - REDRAW_MODEL picks its own frame (1020x340 in, 1568x672 out, max ~21:9) and crops content
 *   that doesn't fit, so callers pad to 21:9 first.
 * - openai/gpt-image-2 is refused on free-tier credits ("Free tier users do not have access to
 *   this model"); switch the constants after topping up if it is wanted.
 */

export const GATEWAY_EDITS_URL = "https://ai-gateway.vercel.sh/v1/images/edits";
export const REDRAW_MODEL = "bfl/flux-kontext-pro";

export function gatewayToken(headers?: Headers): string | null {
  return process.env.AI_GATEWAY_API_KEY || headers?.get("x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN || null;
}

export type GatewayEditResult = { b64: string } | { error: string; status: number };

export async function gatewayImageEdit(opts: {
  /** The incoming request's headers, for the OIDC token on Vercel */
  headers: Headers;
  model: string;
  prompt: string;
  image: Blob;
}): Promise<GatewayEditResult> {
  const token = gatewayToken(opts.headers);
  if (!token) return { error: "AI Gateway isn't configured (set AI_GATEWAY_API_KEY)", status: 500 };

  const form = new FormData();
  form.set("model", opts.model);
  form.set("prompt", opts.prompt);
  form.set("image", opts.image, "image.png");

  let res: Response;
  try {
    res = await fetch(GATEWAY_EDITS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      // Stop before the route's 60s limit so the client gets a handled error, not a platform 504.
      signal: AbortSignal.timeout(50_000),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return { error: "The image model took too long, try again", status: 504 };
    }
    return { error: "Couldn't reach the AI Gateway", status: 502 };
  }
  const d = await res.json().catch(() => null);
  if (!res.ok) {
    const msg: string = d?.error?.message || `AI Gateway error (HTTP ${res.status})`;
    if (res.status === 401) {
      return { error: "AI Gateway token expired or invalid. Locally, run `vercel env pull` again.", status: 401 };
    }
    return { error: msg, status: res.status };
  }
  const item = d?.data?.[0];
  const b64 = typeof item === "string" ? item : item?.b64_json;
  if (typeof b64 !== "string" || !b64) return { error: "AI Gateway returned no image", status: 502 };
  return { b64 };
}
