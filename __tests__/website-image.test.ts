import { describe, it, expect, vi } from "vitest";
import { fetchPhoto, proxiedImage } from "@/lib/website-image";

// SAFETY: fetchPhoto only reads `ok` and `blob()` from the response.
const reply = (ok: boolean, body = "img") => ({ ok, blob: async () => new Blob([body]) }) as Response;

describe("fetchPhoto", () => {
  it("downloads the original through the proxy when it loads", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(true, "original"));
    const blob = await fetchPhoto({ url: "https://x.com/a.jpg", fallbackUrl: "https://x.com/_next/image?url=a" }, fetcher);
    expect(await blob.text()).toBe("original");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(proxiedImage("https://x.com/a.jpg"));
  });

  it("falls back to the optimized copy when the original fails (too big for the proxy)", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply(false)).mockResolvedValueOnce(reply(true, "optimized"));
    const blob = await fetchPhoto({ url: "https://x.com/huge.jpg", fallbackUrl: "https://x.com/_next/image?url=huge" }, fetcher);
    expect(await blob.text()).toBe("optimized");
    expect(fetcher).toHaveBeenLastCalledWith(proxiedImage("https://x.com/_next/image?url=huge"));
  });

  it("says so in plain words when neither loads, or there is no copy to fall back to", async () => {
    const fail = vi.fn().mockResolvedValue(reply(false));
    await expect(fetchPhoto({ url: "https://x.com/a.jpg", fallbackUrl: "https://x.com/b" }, fail)).rejects.toThrow("Couldn't download one of the images");
    await expect(fetchPhoto({ url: "https://x.com/a.jpg" }, fail)).rejects.toThrow("Couldn't download one of the images");
  });
});
