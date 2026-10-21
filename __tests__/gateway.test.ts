import { describe, it, expect, afterEach, vi } from "vitest";
import { gatewayToken } from "@/lib/gateway";

describe("gatewayToken", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the request's OIDC header inside Vercel Functions, where the env var is absent", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    expect(gatewayToken(new Headers({ "x-vercel-oidc-token": "from-request" }))).toBe("from-request");
    expect(gatewayToken(new Headers())).toBeNull();
  });

  it("prefers an API key, then falls back to the env token in local dev", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "key");
    expect(gatewayToken(new Headers({ "x-vercel-oidc-token": "from-request" }))).toBe("key");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "local");
    expect(gatewayToken()).toBe("local");
  });
});
