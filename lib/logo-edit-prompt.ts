import { HEX_RE } from "./logo-edits";

/**
 * Prompt and output schema for the Logo page's Ask AI (app/api/logo-edit). Kept out of the route
 * file so the rules are testable: Next only allows HTTP handlers and config as route exports.
 */

export interface LogoPromptContext {
  /** Background removal is on */
  bgRemoved: boolean;
  /** The kept solid background color, one of the palette hexes, or null */
  bgColor: string | null;
  /** The result has transparent areas, so a fill would show */
  transparent: boolean;
  /** Current background fill, or null */
  fill: string | null;
}

/**
 * Claude cannot draw, so it plans the edit and the browser applies it: a list of
 * "color A -> color B, optionally inside a box" changes, erase boxes, a background flag and a
 * background fill. `from` is constrained to the logo's measured palette, so the edit always
 * targets real pixels instead of a color Claude estimated by eye.
 */
export function editSchema(palette: string[]) {
  const box = {
    type: "object",
    additionalProperties: false,
    required: ["x1", "y1", "x2", "y2"],
    properties: { x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" } },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["edits", "erase", "background", "fill", "note"],
    properties: {
      edits: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["from", "to", "box"],
          properties: {
            from: { type: "string", enum: palette },
            to: { type: "string", description: "New color as #RRGGBB" },
            box: { anyOf: [{ type: "null" }, box] },
          },
        },
      },
      erase: { type: "array", items: box },
      background: { type: "string", enum: ["remove", "keep", "unchanged"] },
      fill: { type: "string", description: '"#RRGGBB", "none" or "unchanged"' },
      note: { type: "string" },
    },
  };
}

/** The background as Claude should understand it. */
function backgroundLine(ctx: LogoPromptContext): string {
  if (ctx.bgColor) {
    return `The logo sits on a solid ${ctx.bgColor} background: ${ctx.bgColor} is the background, the other colors are the logo itself.`;
  }
  if (ctx.transparent) {
    return `The background is transparent${ctx.fill ? ` and filled with ${ctx.fill}` : ""}.`;
  }
  return "The logo has no separate background color.";
}

export function editPrompt(instruction: string, palette: { hex: string; share: number }[], ctx: LogoPromptContext): string {
  const colors = palette.map((c) => `${c.hex} (${Math.round(c.share * 100)}%)`).join(", ");
  return `You help edit a company logo. The user asked: "${instruction}"

The image shows the logo as it looks now. Fully transparent areas are drawn as mid grey (#808080); they are not part of the logo.
Measured logo colors (share of visible pixels): ${colors}
Background removal is currently ${ctx.bgRemoved ? "ON" : "OFF"}. ${backgroundLine(ctx)}

You cannot draw. You carry out the request with these tools only:
- edits: each edit changes every pixel of color "from" inside "box" to color "to". "from" must be one of the measured colors. "box" limits the change to an area, in 0-1 coordinates of the image (x1, y1 = top-left, x2, y2 = bottom-right), or null for the whole logo. When the same color also appears in a part the user did not ask to change, use a box that covers the whole target with a small margin and leaves the other part out. Use several edits for several targets. A solid background is a measured color too: to change its color, recolor it with an edit (box null).
- erase: areas to remove completely, such as a tagline, an icon or a stray mark. Each erase removes every shape that lies mostly inside its box and leaves background in its place, so the box only has to cover most of the part. Use erase for "remove ..." requests; never recolor a part to the background color to hide it.
- background: "remove" if the user asks to remove or clear the background, "keep" if they want it back, otherwise "unchanged".
- fill: a color as "#RRGGBB" painted behind every transparent area. Use it for a background color when the background is transparent, or when you also set background to "remove". "none" removes the current fill. Otherwise "unchanged". A fill does nothing where the logo is not transparent.
- note: one short, friendly sentence to the user saying what you changed, or why you could not do it.

Only recolor the background or fill it when the user asks about the background. Never give the logo and its background the same color: the logo would disappear.
If the request needs anything other than color changes, erasing parts, background removal or a background fill (moving, resizing or redrawing shapes, adding text), return no edits and explain that in the note.`;
}

/**
 * The request's background context, checked: `bgColor` must be one of the measured palette hexes
 * (or Claude could be told to recolor a color that isn't there), `fill` a valid hex.
 */
export function promptContext(input: Partial<LogoPromptContext>, palette: string[]): LogoPromptContext {
  const bg = typeof input.bgColor === "string" ? input.bgColor.toUpperCase() : null;
  return {
    bgRemoved: input.bgRemoved === true,
    bgColor: bg && palette.includes(bg) ? bg : null,
    transparent: input.transparent === true,
    fill: typeof input.fill === "string" && HEX_RE.test(input.fill) ? input.fill.toUpperCase() : null,
  };
}

/** Claude's `fill` answer: "#RRGGBB" to set (uppercased), "none" to clear, null to leave as is. */
export function parseFill(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (HEX_RE.test(v)) return v.toUpperCase();
  return v.toLowerCase() === "none" ? "none" : null;
}
