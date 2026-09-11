import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/** Image types the Messages API accepts inline. The client always sends JPEG after downscaling. */
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
/** Anthropic's inline-image cap is 5 MB decoded; base64 is ~4/3 of that. */
const MAX_B64_LENGTH = Math.ceil((5 * 1024 * 1024 * 4) / 3);

/**
 * Best-effort per-IP rate limit so a leaked URL can't burn the API key. In-memory, so it is
 * per serverless instance; good enough to blunt abuse, not a security boundary.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    // Evict only idle IPs so a flood of spoofed addresses can't reset active counters.
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] >= RATE_WINDOW_MS) hits.delete(k);
  }
  // TODO(simplification): in-memory, per serverless instance. Ceiling: N instances => N x RATE_MAX.
  // Upgrade path: edge rate limiting or a shared store (KV) if the endpoint ever becomes public.
  return recent.length > RATE_MAX;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { bbox: null, label: "", error: "Too many requests, slow down a little" },
      { status: 429 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { bbox: null, label: "", error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const { src, mime } = await req.json();

    if (!src || !mime) {
      return NextResponse.json(
        { bbox: null, label: "", error: "Missing src or mime" },
        { status: 400 },
      );
    }

    if (typeof mime !== "string" || !ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { bbox: null, label: "", error: `Unsupported image type: ${String(mime)}` },
        { status: 400 },
      );
    }

    const b64 = typeof src === "string" ? src.split(",")[1] : undefined;
    if (!b64) {
      return NextResponse.json(
        { bbox: null, label: "", error: "Invalid image data" },
        { status: 400 },
      );
    }
    if (b64.length > MAX_B64_LENGTH) {
      return NextResponse.json(
        { bbox: null, label: "", error: "Image too large (5 MB limit)" },
        { status: 413 },
      );
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mime, data: b64 },
              },
              {
                type: "text",
                text: `You are a professional photo editor cropping images for an experience booking platform (workshops, tours, outdoor activities, events).

You must return TWO things:

1. **subjects_bbox** - A bounding box that contains ALL people and animals in the photo, from the top of the tallest head to the bottom of the lowest feet. This is the "must not cut" zone.

2. **action_point** - The x,y point where the crop should be visually anchored. This is where the crop centers.

Rules for subjects_bbox:
- Include EVERY person and animal, head to toe, with generous padding
- Always leave at least 15% of image height as headroom above the tallest person
- If a subject is near the photo edge, extend the box to that edge
- Include animals (dogs, horses, etc.) fully within the box
- Prefer a LARGER box. When in doubt, go wider

Rules for action_point (in priority order):
1. If one or two subjects dominate the frame and a face is clearly visible, place action_point on the face (or midway between two faces). Faces beat hands and tools.
2. If multiple faces are visible in a group, use the center of the group of faces.
3. If no face is visible (subject from behind, in shadow, masked), use the center of what the subject is doing (hands, canvas, tool, instrument).
4. If the shot is a wide environment/scene with no clear subject, use the visual center of the activity area.

Return ONLY a raw JSON object, no markdown, no explanation:
{"subjects_bbox": {"x1": <0-1>, "y1": <0-1>, "x2": <0-1>, "y2": <0-1>}, "action_point": {"x": <0-1>, "y": <0-1>}, "label": "<short scene description>"}`,
              },
            ],
          },
        ],
      }),
    });

    const d = await res.json();

    if (!res.ok) {
      const error = d?.error || {};
      return NextResponse.json(
        {
          bbox: null,
          label: "",
          error: error.message || `Anthropic API error (HTTP ${res.status})`,
          type: error.type,
        },
        { status: res.status },
      );
    }

    const raw = d.content?.find((b: { type: string }) => b.type === "text")?.text?.trim() || "";

    let jsonStr = raw;
    const fm = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fm) jsonStr = fm[1].trim();
    else {
      const om = raw.match(/\{[\s\S]*\}/);
      if (om) jsonStr = om[0];
    }

    const p = JSON.parse(jsonStr);

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

    // Support both new format (subjects_bbox) and old format (x1/y1/x2/y2)
    const rawBbox = p.subjects_bbox || p;
    const bbox = {
      x1: clamp01(+rawBbox.x1 || 0),
      y1: clamp01(+rawBbox.y1 || 0),
      x2: clamp01(+rawBbox.x2 || 1),
      y2: clamp01(+rawBbox.y2 || 1),
    };

    const focalPoint = p.action_point
      ? { x: clamp01(+p.action_point.x), y: clamp01(+p.action_point.y) }
      : undefined;

    return NextResponse.json({
      bbox,
      focalPoint,
      label: p.label || "",
    });
  } catch (err) {
    const message = err instanceof SyntaxError
      ? "Couldn't parse AI response"
      : err instanceof Error
        ? err.message
        : String(err);
    return NextResponse.json(
      { bbox: null, label: "", error: message },
      { status: 500 },
    );
  }
}
