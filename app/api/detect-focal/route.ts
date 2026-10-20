import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_MIME, CLAUDE_MODEL, CLAUDE_URL, MAX_B64_LENGTH, UPSTREAM_TIMEOUT_MS, claudeHeaders, isTimeout } from "@/lib/claude";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { clamp01 } from "@/lib/logo-edits";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (rateLimited(ip, "detect-focal")) {
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
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ bbox: null, label: "", error: "Send the image as JSON" }, { status: 400 });
    }
    const { src, mime } = body;

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

    const res = await fetch(CLAUDE_URL, {
      method: "POST",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: claudeHeaders(apiKey),
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        // Thinking is on by default and counts against max_tokens; low effort keeps it short,
        // and the headroom stops a long think from truncating the JSON.
        max_tokens: 2048,
        output_config: { effort: "low" },
        fallbacks: "default",
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

    if (d.stop_reason === "refusal") {
      return NextResponse.json({ bbox: null, label: "", error: "The model declined this image" }, { status: 422 });
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
    const message = isTimeout(err)
      ? "Request timed out"
      : err instanceof SyntaxError
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
