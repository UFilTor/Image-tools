import { describe, it, expect } from "vitest";
import { SEND_TARGETS, SHORTCUT_MAP, TOOLS } from "@/lib/constants";
import { extendedBlob } from "@/lib/download";

describe("SEND_TARGETS", () => {
  it("only points at other tools that exist, once each", () => {
    for (const from of SHORTCUT_MAP.modes) {
      const targets = SEND_TARGETS[from];
      expect(targets.length).toBeGreaterThan(0);
      expect(targets).not.toContain(from);
      expect(new Set(targets).size).toBe(targets.length);
      for (const to of targets) expect(TOOLS.some((t) => t.href === `/${to}`)).toBe(true);
    }
  });

  it("covers the chains asked for: crop → upscale and upscale → logo", () => {
    expect(SEND_TARGETS.crop).toContain("upscale");
    expect(SEND_TARGETS.upscale).toContain("logo");
  });
});

describe("extendedBlob", () => {
  it("throws the size limit as user copy before decoding anything", async () => {
    const item = { src: "blob:never-loaded", name: "wide.png", natural: { w: 100_000, h: 100 }, adjusted: false };
    await expect(extendedBlob(item, null, 0, { style: "mirror", color: "#ffffff" })).rejects.toThrow(/per-side limit/);
  });
});
