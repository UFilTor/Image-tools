import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Fake DNS: hostname -> addresses. A missing name throws like getaddrinfo ENOTFOUND.
const dns = vi.hoisted(() => ({ table: new Map<string, string[]>() }));
vi.mock("node:dns/promises", () => {
  const lookup = async (host: string) => {
    const addrs = dns.table.get(host);
    if (!addrs) throw new Error(`getaddrinfo ENOTFOUND ${host}`);
    return addrs.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  return { lookup, default: { lookup } };
});

import { guardedFetch } from "@/lib/brand-scrape/fetch";

const init = () => ({ headers: {}, signal: new AbortController().signal });

describe("guardedFetch resolved-address guard", () => {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>();

  beforeEach(() => {
    dns.table.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("refuses a public-looking name that resolves to loopback, before fetching", async () => {
    dns.table.set("sneaky.example", ["127.0.0.1"]);
    await expect(guardedFetch("https://sneaky.example/", init())).rejects.toThrow(/not reachable/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when any of several addresses is private", async () => {
    dns.table.set("mixed.example", ["93.184.215.14", "::ffff:a9fe:a9fe"]);
    await expect(guardedFetch("https://mixed.example/", init())).rejects.toThrow(/not reachable/);
  });

  it("fetches a name that resolves to public addresses only", async () => {
    dns.table.set("ok.example", ["93.184.215.14"]);
    fetchMock.mockResolvedValue(new Response("hi", { status: 200 }));
    const { res, url } = await guardedFetch("https://ok.example/", init());
    expect(res.status).toBe(200);
    expect(url).toBe("https://ok.example/");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-checks every redirect hop and stops at a private one", async () => {
    dns.table.set("ok.example", ["93.184.215.14"]);
    dns.table.set("internal.example", ["10.0.0.5"]);
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://internal.example/x" } }));
    await expect(guardedFetch("https://ok.example/", init())).rejects.toThrow(/not reachable/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says the site wasn't found when the name doesn't resolve", async () => {
    await expect(guardedFetch("https://nowhere.example/", init())).rejects.toThrow("Couldn't find that website");
  });
});
