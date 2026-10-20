import { describe, it, expect } from "vitest";
import { RATE_LIMITS, clientIp, rateLimited } from "@/lib/rate-limit";

describe("rateLimited", () => {
  it("allows up to the bucket's limit per minute, then refuses", () => {
    const ip = "203.0.113.1";
    for (let i = 0; i < RATE_LIMITS["image-edit"]; i++) expect(rateLimited(ip, "image-edit")).toBe(false);
    expect(rateLimited(ip, "image-edit")).toBe(true);
  });

  it("counts each route separately", () => {
    const ip = "203.0.113.2";
    for (let i = 0; i <= RATE_LIMITS.scrape; i++) rateLimited(ip, "scrape");
    expect(rateLimited(ip, "scrape")).toBe(true);
    expect(rateLimited(ip, "detect-focal")).toBe(false);
  });

  it("counts each IP separately", () => {
    for (let i = 0; i <= RATE_LIMITS["logo-edit"]; i++) rateLimited("203.0.113.3", "logo-edit");
    expect(rateLimited("203.0.113.4", "logo-edit")).toBe(false);
  });
});

describe("clientIp", () => {
  it("prefers the platform's x-real-ip over a client-supplied x-forwarded-for", () => {
    const h = new Headers({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "10.9.1.1, 198.51.100.7" });
    expect(clientIp(h)).toBe("198.51.100.7");
  });

  it("falls back to the first x-forwarded-for entry, then to a fixed key", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

