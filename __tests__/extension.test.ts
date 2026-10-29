import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { extensionFiles, LIVE_ORIGIN } from "../scripts/build-extension.mjs";
import { EXTENSION_FILES, EXTENSION_PATH, PHOTOS } from "@/lib/bookmarklet";

const extensionFile = (name: string) => readFileSync(path.join(__dirname, "..", "public", "extension", name), "utf8");

describe("Send to Image Tools extension", () => {
  it("is built from the current lib/bookmarklet.ts (run npm run build:extension if this fails)", () => {
    for (const [name, text] of Object.entries(extensionFiles(LIVE_ORIGIN).generated)) expect(extensionFile(name), name).toBe(text);
  });

  it("lists every file in its folder, so the download zip is complete", () => {
    const onDisk = readdirSync(path.join(__dirname, "..", "public", "extension")).filter((n) => !n.startsWith("."));
    expect([...EXTENSION_FILES].sort()).toEqual(onDisk.sort());
  });

  it("asks only for the clicked tab, downloads and the Image Tools site", () => {
    const manifest = JSON.parse(extensionFile("manifest.json"));
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "downloads"]);
    expect(manifest.action.default_popup).toBe("popup.html");
    expect(manifest.host_permissions).toEqual([`${LIVE_ORIGIN}/*`]);
  });

  it("repeats the path and message type the receiver listens for", () => {
    const background = extensionFile("background.js");
    expect(background).toContain("`${IMAGE_TOOLS}" + EXTENSION_PATH + "`");
    expect(background).toContain(`type: "${PHOTOS}", via: "extension"`);
  });
});
