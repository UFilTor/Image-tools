import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_MIME, CLAUDE_MODEL, CLAUDE_URL, MAX_B64_LENGTH, UPSTREAM_TIMEOUT_MS, claudeHeaders, isTimeout } from "@/lib/claude";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { HEX_RE, normalizeBox } from "@/lib/logo-edits";
import type { BoundingBox } from "@/lib/types";
import { errorMessage } from "@/lib/errors";
import { editPrompt, editSchema, parseFill, promptContext } from "@/lib/logo-edit-prompt";

export const maxDuration = 60;

const MAX_INSTRUCTION = 500;
const MAX_PALETTE = 12;

export async function POST(req: NextRequest) {
  if (rateLimited(clientIp(req.headers), "logo-edit")) {
    return NextResponse.json({ error: "Too many requests, slow down a little" }, { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Send the edit request as JSON" }, { status: 400 });
    const { src, mime, instruction, palette, bgRemoved, bgColor, transparent, fill } = body;

    if (typeof mime !== "string" || !ALLOWED_MIME.has(mime)) {
      return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
    }
    const b64 = typeof src === "string" ? src.split(",")[1] : undefined;
    if (!b64) return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
    if (b64.length > MAX_B64_LENGTH) return NextResponse.json({ error: "Image too large (5 MB limit)" }, { status: 413 });

    const text = typeof instruction === "string" ? instruction.trim() : "";
    if (!text || text.length > MAX_INSTRUCTION) {
      return NextResponse.json({ error: `Describe the change in 1 to ${MAX_INSTRUCTION} characters` }, { status: 400 });
    }

    const colors: { hex: string; share: number }[] = Array.isArray(palette)
      ? palette
          .filter((c) => c && typeof c.hex === "string" && HEX_RE.test(c.hex) && Number.isFinite(c.share))
          .slice(0, MAX_PALETTE)
          .map((c) => ({ hex: c.hex.toUpperCase(), share: +c.share }))
      : [];
    if (!colors.length) return NextResponse.json({ error: "The logo has no visible colors" }, { status: 400 });
    const ctx = promptContext({ bgRemoved, bgColor, transparent, fill }, colors.map((c) => c.hex));

    const res = await fetch(CLAUDE_URL, {
      method: "POST",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: claudeHeaders(apiKey),
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        // Thinking counts against max_tokens; keep headroom so the JSON is never cut off.
        max_tokens: 4096,
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: editSchema(colors.map((c) => c.hex)) },
        },
        fallbacks: "default",
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
              { type: "text", text: editPrompt(text, colors, ctx) },
            ],
          },
        ],
      }),
    });

    const d = await res.json();
    if (!res.ok) {
      const error = d?.error || {};
      return NextResponse.json(
        { error: error.message || `Anthropic API error (HTTP ${res.status})`, type: error.type },
        { status: res.status },
      );
    }
    if (d.stop_reason === "refusal") {
      return NextResponse.json({ error: "Claude declined this request" }, { status: 422 });
    }
    if (d.stop_reason === "max_tokens") {
      return NextResponse.json({ error: "Claude ran out of room, try a shorter request" }, { status: 502 });
    }

    const raw = d.content?.find((b: { type: string }) => b.type === "text")?.text || "";
    const p = JSON.parse(raw);

    const allowed = new Set(colors.map((c) => c.hex));
    const edits: { from: string; to: string; box: BoundingBox | null }[] = [];
    for (const e of Array.isArray(p.edits) ? p.edits : []) {
      if (typeof e?.from !== "string" || !allowed.has(e.from.toUpperCase())) continue;
      if (typeof e.to !== "string" || !HEX_RE.test(e.to)) continue;
      const box = e.box ? normalizeBox({ x: +e.box.x1, y: +e.box.y1 }, { x: +e.box.x2, y: +e.box.y2 }) : null;
      // A box that doesn't survive validation must not silently widen to the whole logo.
      if (e.box && !box) continue;
      edits.push({ from: e.from.toUpperCase(), to: e.to.toUpperCase(), box });
    }

    const erase: BoundingBox[] = [];
    for (const e of Array.isArray(p.erase) ? p.erase : []) {
      const box = e ? normalizeBox({ x: +e.x1, y: +e.y1 }, { x: +e.x2, y: +e.y2 }) : null;
      if (box) erase.push(box);
    }

    return NextResponse.json({
      edits,
      erase,
      background: ["remove", "keep"].includes(p.background) ? p.background : "unchanged",
      fill: parseFill(p.fill),
      note: typeof p.note === "string" ? p.note.slice(0, 300) : "",
    });
  } catch (err: unknown) {
    if (isTimeout(err)) return NextResponse.json({ error: "Claude took too long, try again" }, { status: 504 });
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
