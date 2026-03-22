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
                text: `You are a professional photo editor. Your job is to find a bounding box that contains ALL of the main subjects.

Step 1 — Count every person or animal visible in the frame, even partially.
Step 2 — Draw the smallest box that contains ALL of them, from the topmost head to the bottommost foot of every subject.
Step 3 — Expand that box by 15% on every side.

Critical rules:
- If there are 2 people, BOTH must be inside the box
- If there are 3 people, ALL 3 must be inside the box
- Always include full body: top of head to bottom of feet. Never cut at waist, chest, or knees
- If a body part is cut off by the photo edge, extend the box to the photo edge on that side

Return ONLY a raw JSON object, no markdown, no explanation:
{"x1": <0.0–1.0>, "y1": <0.0–1.0>, "x2": <0.0–1.0>, "y2": <0.0–1.0>, "label": "<short description>"}`,
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
