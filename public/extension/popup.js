// The picker that opens from the toolbar button: every image on the page, in page order, with its
// size. Download saves the picked files exactly as the site serves them, into a folder named after
// the site; Send hands them to Image Tools. Both run in background.js, which outlives this popup.

import { collectPhotoUrls } from "./collect.js";

/** Under this many pixels on the shorter side, an image counts as small (the photo finder's own limit). */
const SMALL_SIDE = 300;
/** The most images the picker lists; a page with more shows the first ones and says so. */
const PICKER_MAX = 300;

const $ = (id) => document.getElementById(id);
const items = []; // { url, tile, button, small }
let tab;
let host = "";

init();

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    host = new URL(tab.url).hostname.replace(/^www\./, "");
  } catch {
    host = "images";
  }

  let urls;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectPhotoUrls,
      // TODO(simplification): at most PICKER_MAX images; the header says so when a page has more.
      // Upgrade path: page through them.
      args: [{ minSide: 0, max: PICKER_MAX, everything: true, order: "page" }],
    });
    if (!Array.isArray(result)) throw new Error("no result");
    urls = result;
  } catch {
    return note("This page can't be read. Browser pages and extension stores are off-limits to extensions.", true);
  }
  if (!urls.length) return note("No images on this page yet. Scroll so they load, then open this again.");

  for (const url of urls) addTile(url);
  $("controls").hidden = false;
  $("foot").hidden = false;
  $("hide-small").addEventListener("change", applyFilter);
  $("select-all").addEventListener("click", toggleAll);
  $("download").addEventListener("click", download);
  $("send").addEventListener("click", send);
  applyFilter();
}

function addTile(url) {
  const tile = document.createElement("li");
  tile.className = "tile";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pick";
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-label", `Pick ${fileName(url)}`);
  const img = document.createElement("img");
  img.alt = "";
  img.src = url;
  button.append(img);

  const info = document.createElement("div");
  info.className = "info";
  const size = document.createElement("span");
  size.className = "size";
  size.textContent = "…";
  const copy = actionButton("Copy URL", "Copy the image's address", async () => {
    try {
      await navigator.clipboard.writeText(url);
      status(`Copied the address of ${fileName(url)}`);
    } catch {
      status("Couldn't copy the address. Use Open and copy it from the address bar.", true);
    }
  });
  const open = actionButton("Open", "Open the image in a new tab", () => chrome.tabs.create({ url, active: false }));
  info.append(size, copy, open);
  tile.append(button, info);
  $("grid").append(tile);

  const item = { url, tile, button, small: false };
  items.push(item);
  img.addEventListener("load", () => {
    size.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
    item.small = Math.min(img.naturalWidth, img.naturalHeight) < SMALL_SIDE;
    applyFilter();
  });
  img.addEventListener("error", () => {
    // The site refuses to show it here, but a download may still work.
    size.textContent = "No preview";
    const blocked = document.createElement("span");
    blocked.className = "blocked";
    blocked.textContent = fileName(url);
    img.replaceWith(blocked);
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
  const shown = items.filter((i) => !i.tile.hidden).length;
  const hidden = items.length - shown;
  const capped = items.length >= PICKER_MAX ? ` · first ${PICKER_MAX} on the page` : "";
  $("meta").textContent = `${shown} image${shown === 1 ? "" : "s"} on ${host}${hidden ? ` · ${hidden} small hidden` : ""}${capped}`;
  updateCount();
}

function toggleAll() {
  const visible = items.filter((i) => !i.tile.hidden);
  const allPicked = visible.every((i) => i.button.getAttribute("aria-pressed") === "true");
  for (const item of visible) item.button.setAttribute("aria-pressed", String(!allPicked));
  updateCount();
}

function picked() {
  return items.filter((i) => !i.tile.hidden && i.button.getAttribute("aria-pressed") === "true").map((i) => i.url);
}

function updateCount() {
  const n = picked().length;
  $("download").disabled = !n;
  $("send").disabled = !n;
  $("download").textContent = n ? `Download ${n}` : "Download";
  $("select-all").textContent = n && n === items.filter((i) => !i.tile.hidden).length ? "Select none" : "Select all";
  status(n ? `${n} picked` : "Pick images");
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
  await chrome.runtime.sendMessage({ type: "send", tabId: tab.id, urls: picked() });
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
