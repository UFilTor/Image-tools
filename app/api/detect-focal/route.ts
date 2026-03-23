import { NextRequest, NextResponse } from "next/server";

// Allow large base64 image payloads (up to 25MB)
export const maxDuration = 60;

export async function POST(req: NextRequest) {
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

    const b64 = src.split(",")[1];
    if (!b64) {
      return NextResponse.json(
        { bbox: null, label: "", error: "Invalid image data" },
        { status: 400 },
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
        model: "claude-sonnet-4-20250514",
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

Your goal: find the focal area that captures BOTH the main subjects AND the surrounding environment/activity context. Do NOT zoom in tight on people. Show the scene.

Step 1 - Identify the main action or activity happening in the photo.
Step 2 - Identify all people involved in that activity.
Step 3 - Draw a bounding box that includes:
  a) All people from top of head to feet (with generous headroom above)
  b) Enough surrounding environment to show WHERE the activity takes place
Step 4 - Add 25% padding on all sides to ensure nothing gets clipped when cropped to a fixed aspect ratio.

Critical rules:
- NEVER cut off heads. Always leave space ABOVE the tallest person's head (at least 10% of image height).
- Include environmental context: the workshop space, the shooting range, the forest, the water, the kitchen, etc.
- If people are spread across the image, include ALL of them.
- Prefer a LARGER box over a tighter one. When in doubt, go wider.
- If a person is near the edge of the photo, extend the box to that edge.
- The box should typically cover 60-90% of the image, not a small region.

Return ONLY a raw JSON object, no markdown, no explanation:
{"x1": <0.0-1.0>, "y1": <0.0-1.0>, "x2": <0.0-1.0>, "y2": <0.0-1.0>, "label": "<short description of the scene>"}`,
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

    return NextResponse.json({
      bbox: {
        x1: Math.max(0, Math.min(1, +p.x1 || 0)),
        y1: Math.max(0, Math.min(1, +p.y1 || 0)),
        x2: Math.max(0, Math.min(1, +p.x2 || 1)),
        y2: Math.max(0, Math.min(1, +p.y2 || 1)),
      },
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
