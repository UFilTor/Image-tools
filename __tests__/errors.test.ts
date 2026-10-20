import { describe, it, expect } from "vitest";
import { OFFLINE_MESSAGE, errorMessage, isNetworkError, userMessage } from "@/lib/errors";

describe("network error messages", () => {
  it("recognises each browser's fetch failure", () => {
    for (const msg of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "Network request failed"]) {
      expect(isNetworkError(new TypeError(msg))).toBe(true);
      expect(userMessage(new TypeError(msg))).toBe(OFFLINE_MESSAGE);
    }
  });

  it("keeps the real message for other errors, including non-network TypeErrors", () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'x')");
    expect(isNetworkError(bug)).toBe(false);
    expect(userMessage(bug)).toBe(bug.message);
    expect(userMessage(new Error("Too large to generate"))).toBe("Too large to generate");
    expect(errorMessage("plain string")).toBe("plain string");
  });
});
