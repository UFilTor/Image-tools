import { describe, it, expect } from "vitest";
import { sharpenMask } from "@/lib/bg-removal";

describe("sharpenMask", () => {
  it("drops faint background and makes confident subject pixels solid", () => {
    expect(sharpenMask(4)).toBe(0); // sky
    expect(sharpenMask(24)).toBe(0); // faint bridge
    expect(sharpenMask(161)).toBeGreaterThanOrEqual(250); // person
    expect(sharpenMask(208)).toBe(255);
  });

  it("is monotonic, so edges stay soft rather than jagged", () => {
    for (let a = 1; a <= 255; a++) expect(sharpenMask(a)).toBeGreaterThanOrEqual(sharpenMask(a - 1));
    expect(sharpenMask(108)).toBeGreaterThan(0);
    expect(sharpenMask(108)).toBeLessThan(255);
  });
});
