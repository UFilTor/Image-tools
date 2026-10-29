// The picker that opens from the toolbar button: the page's videos, then every image in page order,
// each with its size. Download saves the picked files exactly as the site serves them, into a folder
// named after the site; Send hands the picked images to Image Tools (its tools are for photos, so
// videos are download only). Both run in background.js, which outlives this popup.

import { collectPhotoUrls, collectVideos } from "./collect.js";

/** Under this many pixels on the shorter side, an image counts as small (the photo finder's own limit). */
const SMALL_SIDE = 300;
/** The most images the picker lists; a page with more shows the first ones and says so. */
const PICKER_MAX = 300;

const $ = (id) => document.getElementById(id);
const items = []; // { url, tile, button, small, video }
let tab;
let host = "";
/** Videos that stream in pieces (Instagram, YouTube): counted, since there is no file to save. */
let streams = 0;

init();

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    host = new URL(tab.url).hostname.replace(/^www\./, "");
  } catch {
    host = "images";
  }

  let urls;
  let videos;
  try {
    const [[{ result: images }], [{ result: found }]] = await Promise.all([
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectPhotoUrls,
        // TODO(simplification): at most PICKER_MAX images; the header says so when a page has more.
        // Upgrade path: page through them.
        args: [{ minSide: 0, max: PICKER_MAX, everything: true, order: "page" }],
      }),
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectVideos }),
    ]);
    if (!Array.isArray(images) || !Array.isArray(found?.videos)) throw new Error("no result");
    urls = images;
    videos = found.videos;
    streams = found.streams;
  } catch {
    return note("This page can't be read. Browser pages and extension stores are off-limits to extensions.", true);
  }
  if (!urls.length && !videos.length) {
    return note(
      streams
        ? "This page's videos stream in pieces, so there is no file to save, and it has no images yet."
        : "No images or videos on this page yet. Scroll so they load, then open this again.",
    );
  }

  for (const video of videos) addTile(video.url, video);
  for (const url of urls) addTile(url);
  $("controls").hidden = false;
  $("foot").hidden = false;
  $("hide-small").addEventListener("change", applyFilter);
  $("select-all").addEventListener("click", toggleAll);
  $("download").addEventListener("click", download);
  $("send").addEventListener("click", send);
  applyFilter();
}

/** One tile; `video` is { poster } for a video, which shows its poster or its first frame. */
function addTile(url, video) {
  const tile = document.createElement("li");
  tile.className = "tile";
  const button = document.createElement("button");
  button.type = "button";
  button.className = video ? "pick video" : "pick";
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-label", `Pick ${video ? "video " : ""}${fileName(url)}`);
  const preview = video && !video.poster ? document.createElement("video") : document.createElement("img");
  if (preview instanceof HTMLVideoElement) {
    preview.muted = true;
    preview.preload = "metadata";
    preview.src = url;
  } else {
    preview.alt = "";
    preview.src = video?.poster ?? url;
  }
  button.append(preview);

  const info = document.createElement("div");
  info.className = "info";
  const size = document.createElement("span");
  size.className = "size";
  size.textContent = "…";
  const copy = actionButton("Copy URL", "Copy the file's address", async () => {
    try {
      await navigator.clipboard.writeText(url);
      status(`Copied the address of ${fileName(url)}`);
    } catch {
      status("Couldn't copy the address. Use Open and copy it from the address bar.", true);
    }
  });
  const open = actionButton("Open", "Open the file in a new tab", () => chrome.tabs.create({ url, active: false }));
  info.append(size, copy, open);
  tile.append(button, info);
  $("grid").append(tile);

  const item = { url, tile, button, small: false, video: Boolean(video) };
  items.push(item);
  if (video) {
    size.textContent = "Video";
    // The tile may show the poster: read the size from the video itself, metadata only.
    const probe = preview instanceof HTMLVideoElement ? preview : document.createElement("video");
    probe.preload = "metadata";
    if (probe !== preview) probe.src = url;
    probe.addEventListener("loadedmetadata", () => {
      size.textContent = `Video · ${probe.videoWidth} × ${probe.videoHeight}`;
    });
  }
  if (!(preview instanceof HTMLVideoElement)) {
    preview.addEventListener("load", () => {
      // A video's poster is not the video: its size says nothing, and videos are never hidden as small.
      if (video) return;
      size.textContent = `${preview.naturalWidth} × ${preview.naturalHeight}`;
      item.small = Math.min(preview.naturalWidth, preview.naturalHeight) < SMALL_SIDE;
      applyFilter();
    });
  }
  preview.addEventListener("error", () => {
    // The site refuses to show it here, but a download may still work.
    size.textContent = video ? "Video · no preview" : "No preview";
    const blocked = document.createElement("span");
    blocked.className = "blocked";
    blocked.textContent = fileName(url);
    preview.replaceWith(blocked);
  });
  button.addEventListener("click", () => {
    button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"));
    updateCount();
  });
}

function actionButton(label, title, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  button.addEventListener("click", onClick);
  return button;
}

/** Hide small images when the switch is on; a hidden image is never part of the selection. */
function applyFilter() {
  const hideSmall = $("hide-small").checked;
  for (const item of items) {
    item.tile.hidden = hideSmall && item.small;
    if (item.tile.hidden) item.button.setAttribute("aria-pressed", "false");
  }
  const images = items.filter((i) => !i.video && !i.tile.hidden).length;
  const videos = items.filter((i) => i.video).length;
  const hidden = items.filter((i) => i.tile.hidden).length;
  const parts = [`${images} image${images === 1 ? "" : "s"}`];
  if (videos) parts.push(`${videos} video${videos === 1 ? "" : "s"}`);
  const capped = items.length - videos >= PICKER_MAX ? ` · first ${PICKER_MAX} images on the page` : "";
  const streamed = streams ? ` · ${streams} streamed video${streams === 1 ? "" : "s"} can't be saved` : "";
  $("meta").textContent = `${parts.join(", ")} on ${host}${hidden ? ` · ${hidden} small hidden` : ""}${capped}${streamed}`;
  updateCount();
}

function toggleAll() {
  const visible = items.filter((i) => !i.tile.hidden);
  const allPicked = visible.every((i) => i.button.getAttribute("aria-pressed") === "true");
  for (const item of visible) item.button.setAttribute("aria-pressed", String(!allPicked));
  updateCount();
}

function pickedItems() {
  return items.filter((i) => !i.tile.hidden && i.button.getAttribute("aria-pressed") === "true");
}

function picked() {
  return pickedItems().map((i) => i.url);
}

/** Send takes images only: Image Tools' tools are for photos. */
function pickedImages() {
  return pickedItems().filter((i) => !i.video).map((i) => i.url);
}

function updateCount() {
  const n = picked().length;
  const videos = n - pickedImages().length;
  $("download").disabled = !n;
  $("send").disabled = !pickedImages().length;
  $("download").textContent = n ? `Download ${n}` : "Download";
  $("select-all").textContent = n && n === items.filter((i) => !i.tile.hidden).length ? "Select none" : "Select all";
  status(!n ? "Pick images or videos" : videos ? `${n} picked · videos download only` : `${n} picked`);
}

async function download() {
  const urls = picked();
  $("download").disabled = true;
  status(`Saving ${urls.length} to Downloads/${host}…`);
  const result = await chrome.runtime.sendMessage({ type: "download", folder: host, urls });
  $("download").disabled = false;
  if (!result || result.started === 0) return status("Couldn't start the downloads. Try again.", true);
  status(
    result.failed
      ? `Saved ${result.started} to Downloads/${result.folder}. ${result.failed} couldn't be downloaded.`
      : `Saved ${result.started} to Downloads/${result.folder}`,
    Boolean(result.failed),
  );
}

async function send() {
  await chrome.runtime.sendMessage({ type: "send", tabId: tab.id, urls: pickedImages() });
  window.close();
}

function note(text, error = false) {
  $("meta").textContent = host ? `On ${host}` : "";
  const el = $("note");
  el.textContent = text;
  el.classList.toggle("error", error);
  el.hidden = false;
}

function status(text, error = false) {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("error", error);
}

function fileName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "") || "image";
  } catch {
    return "image";
  }
}
