/**
 * Vercel AI Gateway image edits (OpenAI-compatible `/v1/images/edits`), raw fetch like
 * `lib/claude.ts`. Server-side only.
 *
 * Auth: AI_GATEWAY_API_KEY, or the project's OIDC token (set automatically on Vercel; locally
 * `vercel env pull` writes a VERCEL_OIDC_TOKEN that expires after 12 hours).
 *
 * Models (tested 2026-10-20 on the team's free-tier credits):
 * - FILL_MODEL keeps the input size exactly (1536x484 in, 1536x484 out) and follows BFL's mask
 *   convention: WHITE = generate, BLACK = keep, opaque PNG. A transparent mask (the OpenAI
 *   convention in the gateway docs) is ignored and the margins come back black.
 * - REDRAW_MODEL picks its own frame (1020x340 in, 1568x672 out, max ~21:9) and crops content
 *   that doesn't fit, so callers pad to 21:9 first.
 * - openai/gpt-image-2 is refused on free-tier credits ("Free tier users do not have access to
 *   this model"); switch the constants after topping up if it is wanted.
 */

export const GATEWAY_EDITS_URL = "https://ai-gateway.vercel.sh/v1/images/edits";
export const FILL_MODEL = "bfl/flux-pro-1.0-fill";
export const REDRAW_MODEL = "bfl/flux-kontext-pro";

export function gatewayToken(): string | null {
  return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || null;
}

export type GatewayEditResult = { b64: string } | { error: string; status: number };

export async function gatewayImageEdit(opts: {
  model: string;
  prompt: string;
  image: Blob;
  mask?: Blob;
}): Promise<GatewayEditResult> {
  const token = gatewayToken();
  if (!token) return { error: "AI Gateway isn't configured (set AI_GATEWAY_API_KEY)", status: 500 };

  const form = new FormData();
  form.set("model", opts.model);
  form.set("prompt", opts.prompt);
  form.set("image", opts.image, "image.png");
  if (opts.mask) form.set("mask", opts.mask, "mask.png");

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
