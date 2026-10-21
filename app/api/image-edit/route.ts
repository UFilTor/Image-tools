import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { REDRAW_MODEL, gatewayImageEdit } from "@/lib/gateway";
import { errorMessage } from "@/lib/errors";

// Image models took 7-25s in testing. 60s matches detect-focal,
// which already deploys on this team's plan.
export const maxDuration = 60;

/** Vercel caps a function request body at 4.5 MB; stay under it with room for the form fields. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_INSTRUCTION = 300;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

/**
 * The prompt is framed here, not in the browser. The logo redraw takes a free instruction by
 * design, so anyone who can reach the route can edit any image with it, on the team's gateway
 * credits. The real cap is the 10/min rate limit plus a spend limit set on the AI Gateway team.
 * The "clean vector-style graphic" framing is what makes Kontext sharpen: with only the user's
 * "make it crisp", it kept the blocky JPEG letters in testing.
 */
function redrawPrompt(instruction: string): string {
  return (
    `Redraw this logo as a clean, sharp, vector-style graphic with crisp edges and flat colors. ${instruction}. ` +
    "Keep the exact same design, text, spelling, colors and layout. Keep the whole logo in frame."
  );
}

function mimeOf(b64: string): string {
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}

export async function POST(req: NextRequest) {
  if (rateLimited(clientIp(req.headers), "image-edit")) {
    return NextResponse.json({ error: "Too many requests, slow down a little" }, { status: 429 });
  }

  try {
    const form = await req.formData();
    const purpose = form.get("purpose");
    const image = form.get("image");
    if (!(image instanceof Blob) || !IMAGE_TYPES.has(image.type)) {
      return NextResponse.json({ error: "Send the image as PNG or JPEG" }, { status: 400 });
    }
    if (image.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Image too large to send" }, { status: 413 });
    if (purpose !== "logo") return NextResponse.json({ error: "Unknown purpose" }, { status: 400 });

    const raw = form.get("instruction");
    const instruction = typeof raw === "string" ? raw.trim().replace(/[.\s]+$/, "") : "";
    if (!instruction || instruction.length > MAX_INSTRUCTION) {
      return NextResponse.json({ error: `Describe the change in 1 to ${MAX_INSTRUCTION} characters` }, { status: 400 });
    }
    const result = await gatewayImageEdit({ headers: req.headers, model: REDRAW_MODEL, prompt: redrawPrompt(instruction), image });

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    // Raw bytes, not a data URL: the browser turns them into an object URL (project rule).
    return new NextResponse(Buffer.from(result.b64, "base64"), {
      headers: { "Content-Type": mimeOf(result.b64), "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
