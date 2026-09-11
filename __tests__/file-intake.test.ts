import { describe, it, expect } from "vitest";
import { validateFiles, needsConversion } from "@/lib/file-intake";
import { MAX_FILE_SIZE } from "@/lib/constants";

const file = (name: string, type: string, size = 10) =>
  new File([new Uint8Array(size)], name, { type });

describe("validateFiles", () => {
  it("accepts supported types under the size limit", () => {
    expect(validateFiles([file("a.png", "image/png"), file("b.jpg", "image/jpeg")])).toBeNull();
  });
  it("names the offending file for unsupported types", () => {
    expect(validateFiles([file("doc.pdf", "application/pdf")])).toMatch(/Unsupported format: doc\.pdf/);
  });
  it("rejects files over the size cap", () => {
    const big = { name: "big.png", type: "image/png", size: MAX_FILE_SIZE + 1 } as File;
    expect(validateFiles([big])).toMatch(/exceeds 20MB/);
  });
});

describe("needsConversion", () => {
  it("is false for browser-native formats", () => {
    expect(needsConversion([file("a.png", "image/png")])).toBe(false);
  });
  it("is true when an SVG or HEIC is present", () => {
    expect(needsConversion([file("a.png", "image/png"), file("logo.svg", "image/svg+xml")])).toBe(true);
    expect(needsConversion([file("shot.heic", "image/heic")])).toBe(true);
  });
});
