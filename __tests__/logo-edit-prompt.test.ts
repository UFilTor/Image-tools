import { describe, it, expect } from "vitest";
import { editPrompt, editSchema, parseFill, promptContext } from "@/lib/logo-edit-prompt";

const palette = [
  { hex: "#FAFBF9", share: 0.82 },
  { hex: "#0E1011", share: 0.12 },
];
const ctx = { bgRemoved: false, bgColor: null, transparent: false, fill: null };

describe("editPrompt background context", () => {
  it("names the kept solid background, so Claude can recolor it", () => {
    const p = editPrompt("background in 3a4630", palette, { ...ctx, bgColor: "#FAFBF9" });
    expect(p).toContain("solid #FAFBF9 background: #FAFBF9 is the background");
    expect(p).toContain("to change its color, recolor it with an edit");
  });

  it("describes a transparent background and its current fill", () => {
    expect(editPrompt("x", palette, { ...ctx, bgRemoved: true, transparent: true })).toContain("The background is transparent.");
    expect(editPrompt("x", palette, { ...ctx, transparent: true, fill: "#3A4630" })).toContain(
      "The background is transparent and filled with #3A4630.",
    );
  });

  it("says when there is no separate background", () => {
    expect(editPrompt("x", palette, ctx)).toContain("The logo has no separate background color.");
  });

  it("forbids giving the logo and its background the same color", () => {
    expect(editPrompt("x", palette, ctx)).toContain("Never give the logo and its background the same color");
  });
});

describe("editSchema", () => {
  it("requires a fill answer next to the edits", () => {
    const s = editSchema(palette.map((c) => c.hex));
    expect(s.required).toContain("fill");
    expect(s.properties.edits.items.properties.from.enum).toEqual(["#FAFBF9", "#0E1011"]);
  });
});

describe("parseFill", () => {
  it("sets a valid hex, clears on none, and ignores everything else", () => {
    expect(parseFill("#3a4630")).toBe("#3A4630");
    expect(parseFill(" none ")).toBe("none");
    expect(parseFill("unchanged")).toBeNull();
    expect(parseFill("green")).toBeNull();
    expect(parseFill(undefined)).toBeNull();
  });
});

describe("promptContext", () => {
  const hexes = palette.map((c) => c.hex);

  it("keeps a background color only when it is a measured palette color", () => {
    expect(promptContext({ bgColor: "#fafbf9" }, hexes).bgColor).toBe("#FAFBF9");
    expect(promptContext({ bgColor: "#123456" }, hexes).bgColor).toBeNull();
  });

  it("keeps only a valid fill hex and treats anything but true as false", () => {
    const ctx = promptContext({ fill: "#3a4630", transparent: true, bgRemoved: false }, hexes);
    expect(ctx).toEqual({ bgRemoved: false, bgColor: null, transparent: true, fill: "#3A4630" });
    expect(promptContext({ fill: "green" }, hexes).fill).toBeNull();
    expect(promptContext({}, hexes)).toEqual({ bgRemoved: false, bgColor: null, transparent: false, fill: null });
  });
});
