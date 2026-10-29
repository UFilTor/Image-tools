// "Send to Image Tools" extension, background half. The toolbar button opens the picker
// (popup.html), which asks this worker to do the work that must outlive the popup:
// - "send": read the picked photos' bytes inside the page, open Image Tools next to it and hand them
//   over (components/bookmarklet-receiver.tsx). The bookmarklet does the same in Chrome; Arc and
//   Dia don't run bookmarklets, and some pages' security policy blocks one.
// - "download": save the picked files exactly as the site serves them, in Downloads/<site>/.
// Built by scripts/build-extension.mjs; config.js holds the Image Tools address.

import { IMAGE_TOOLS, VERSION } from "./config.js";
import { collectPhotoUrls } from "./collect.js";

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === "send") {
    sendUrls(message.tabId, message.urls).catch((error) => flag(message.tabId, errorText(error)));
  } else if (message?.type === "download") {
    downloadOriginals(message.folder, message.urls).then(reply);
    return true; // reply comes later
  }
});

const errorText = (error) => (error instanceof Error ? error.message : String(error));

/**
 * The folders pending downloads go to, by URL, in start order, until Chrome asks where to save
 * each one. A queue, so the same URL downloaded twice in a row keeps both folders.
 */
const foldersFor = new Map();

/** Start one download per URL; the browser fetches each file itself, so the bytes are the site's own. */
async function downloadOriginals(folder, urls) {
  const safe = String(folder).replace(/[^\w.-]+/g, "-") || "images";
  let started = 0;
  for (const url of urls) {
    foldersFor.set(url, [...(foldersFor.get(url) ?? []), safe]);
    try {
      await chrome.downloads.download({ url, conflictAction: "uniquify", saveAs: false });
      started++;
    } catch {
      takeFolder(url);
    }
  }
  return { started, failed: urls.length - started, folder: safe };
}

function takeFolder(url) {
  const queue = foldersFor.get(url) ?? [];
  const folder = queue.shift();
  if (queue.length) foldersFor.set(url, queue);
  else foldersFor.delete(url);
  return folder;
}

// Keep the name Chrome picks (it adds the right extension for the file type), inside the site's folder.
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const folder = takeFolder(item.url);
  if (!folder) return; // someone else's download: Chrome keeps its own choice
  suggest({ filename: `${folder}/${item.filename}`, conflictAction: "uniquify" });
});

/** Collect the tab's photos with the bookmarklet's rules and send them; for testing from the worker console. */
async function sendPage(tab) {
  const [{ result: urls }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectPhotoUrls });
  await sendUrls(tab.id, urls ?? []);
}

/** Read the photos inside their page, open Image Tools next to it and deliver them. */
async function sendUrls(tabId, urls) {
  const tab = await chrome.tabs.get(tabId);
  await chrome.action.setBadgeText({ text: "", tabId: tab.id });
  if (!urls.length) {
    await showToast(tab.id, "No large photos on this page yet. Scroll so the photos load, then try again.");
    return;
  }
  await showToast(tab.id, `Sending ${urls.length} photo${urls.length === 1 ? "" : "s"} to Image Tools…`);
  // Bytes can be too many to hand back in one go: then Image Tools fetches the URLs itself.
  const page = await chrome.scripting
    .executeScript({ target: { tabId: tab.id }, func: readPhotos, args: [urls] })
    .then(([{ result }]) => result)
    .catch(() => ({ page: tab.url, photos: urls.map((url) => ({ url })) }));
  const target = await chrome.tabs.create({ url: `${IMAGE_TOOLS}/crop?from=extension`, index: tab.index + 1, openerTabId: tab.id });
  await imageToolsLoaded(target.id);
  const [{ result: delivered }] = await chrome.scripting.executeScript({
    target: { tabId: target.id },
    func: deliver,
    args: [{ ...page, version: VERSION }],
  });
  if (!delivered) await flag(tab.id, "Image Tools didn't take the photos. Reload it, then try again.");
}

// Lets you run it from the service worker's console while testing: sendPage(tab), downloadOriginals(folder, urls).
globalThis.sendPage = sendPage;
globalThis.downloadOriginals = downloadOriginals;

/** Resolves once the tab shows Image Tools, after a Vercel sign-in if one comes first. */
function imageToolsLoaded(tabId) {
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(check);
    };
    const check = (id, _info, tab) => {
      if (id !== tabId || tab.status !== "complete" || !tab.url?.startsWith(IMAGE_TOOLS)) return;
      done();
      resolve();
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error("Image Tools didn't load. Check that you are signed in to Vercel."));
    }, 300_000);
    chrome.tabs.onUpdated.addListener(check);
    chrome.tabs.get(tabId).then((tab) => check(tabId, {}, tab));
  });
}

/** Marks the button when something failed: a red "!" and the reason as its tooltip. */
async function flag(tabId, message) {
  await chrome.action.setBadgeBackgroundColor({ color: "#B42318" });
  await chrome.action.setBadgeText({ text: "!", tabId });
  await chrome.action.setTitle({ title: `Send to Image Tools: ${message}`, tabId });
}

function showToast(tabId, text) {
  // Pages scripts may not touch (browser pages, the Web Store) still get the message, as the button's tooltip.
  return chrome.scripting.executeScript({ target: { tabId }, func: toast, args: [text] }).catch(() => flag(tabId, text));
}

// The functions below run inside a page, not here, so each must stand on its own. readPhotos and toast
// repeat what bookmarkletMain does in lib/bookmarklet.ts; keep the two in step.

/** In the source page: the page's own CORS rules apply, and the cache usually has the bytes. */
async function readPhotos(urls) {
  const MAX_BYTES = 15 * 1024 * 1024;
  const asDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  const photos = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "force-cache" });
        const blob = res.ok ? await res.blob() : null;
        return blob && blob.type.startsWith("image/") && blob.size <= MAX_BYTES ? { url, dataUrl: await asDataUrl(blob) } : { url };
      } catch {
        return { url };
      }
    }),
  );
  return { page: location.href, photos };
}

/** In the source page: a short note in the corner, like the bookmarklet's. */
function toast(text) {
  const id = "send-to-image-tools-toast";
  document.getElementById(id)?.remove();
  const box = document.createElement("div");
  box.id = id;
  box.textContent = text;
  Object.assign(box.style, {
    position: "fixed",
    zIndex: "2147483647",
    top: "16px",
    right: "16px",
    maxWidth: "320px",
    background: "#022C12",
    color: "#fff",
    font: "14px/1.4 system-ui, sans-serif",
    padding: "10px 14px",
    borderRadius: "10px",
    boxShadow: "0 4px 16px rgba(0,0,0,.25)",
  });
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4000);
}

/** In the Image Tools tab: waits for its receiver, then posts the photos to the page. False when it never got ready. */
async function deliver(payload) {
  for (let i = 0; i < 150 && document.documentElement.dataset.imageToolsReceiver !== "ready"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (document.documentElement.dataset.imageToolsReceiver !== "ready") return false;
  const photos = await Promise.all(
    payload.photos.map(async (p) => (p.dataUrl ? { url: p.url, blob: await (await fetch(p.dataUrl)).blob() } : { url: p.url })),
  );
  window.postMessage(
    { type: "image-tools:photos", via: "extension", version: payload.version, page: payload.page, photos },
    location.origin,
  );
  return true;
}
