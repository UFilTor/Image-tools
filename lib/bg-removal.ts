/**
 * Main-thread side of AI background removal (see `bg-removal.worker.ts`). One worker, created
 * on first use and terminated after 3 minutes idle because the model holds a few hundred MB,
 * the same policy as the upscale worker.
 */

import type { BgWorkerRequest, BgWorkerResponse } from "./bg-removal.worker";

const IDLE_MS = 3 * 60_000;

interface Job {
  resolve: (alpha: Uint8Array) => void;
  reject: (err: Error) => void;
  onProgress?: (pct: number) => void;
}

let worker: Worker | null = null;
let nextId = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const pending = new Map<number, Job>();

function scheduleIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (pending.size) return;
    worker?.terminate();
    worker = null;
  }, IDLE_MS);
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./bg-removal.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<BgWorkerResponse>) => {
    const msg = e.data;
    const job = pending.get(msg.id);
    if (!job) return;
    if (msg.type === "progress") {
      job.onProgress?.(msg.pct);
      return;
    }
    pending.delete(msg.id);
    if (msg.type === "done") job.resolve(new Uint8Array(msg.alpha));
    else job.reject(new Error(msg.message));
    scheduleIdle();
  };
  w.onerror = (e) => {
    for (const job of pending.values()) job.reject(new Error(e.message || "The AI worker stopped unexpectedly"));
    pending.clear();
    w.terminate();
    if (worker === w) worker = null;
  };
  worker = w;
  return w;
}

/**
 * The q8 model's mask is soft: clear subjects come out at alpha ~140-210, faint background
 * structures at ~5-40. A smoothstep between MASK_LO and MASK_HI makes confident pixels solid and
 * drops faint ones while keeping a soft edge.
 * TODO(simplification): fixed curve. Ceiling: low-contrast subjects can lose detail. Upgrade path:
 * a larger model (BiRefNet) or a per-image control if this proves too blunt.
 */
const MASK_LO = 51;
const MASK_HI = 166;
export function sharpenMask(a: number): number {
  const t = Math.max(0, Math.min(1, (a - MASK_LO) / (MASK_HI - MASK_LO)));
  return Math.round(t * t * (3 - 2 * t) * 255);
}

/** Cut out the main subject with the AI model. Returns a new canvas; `src` is left untouched. */
export async function removeBgAI(
  src: HTMLCanvasElement,
  onProgress?: (pct: number) => void,
): Promise<HTMLCanvasElement> {
  const w = src.width,
    h = src.height;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);

  if (idleTimer) clearTimeout(idleTimer);
  const alpha = await new Promise<Uint8Array>((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject, onProgress });
    const rgba = data.data.slice().buffer;
    getWorker().postMessage({ id, rgba, width: w, height: h } satisfies BgWorkerRequest, [rgba]);
  });

  // TODO(simplification): no edge decontamination. Ceiling: soft edges keep a trace of the old
  // background color. Upgrade path: un-blend edge pixels the way removeBg does for solid colors.
  const px = data.data;
  for (let p = 0; p < alpha.length; p++) px[p * 4 + 3] = Math.round((px[p * 4 + 3] * sharpenMask(alpha[p])) / 255);
  ctx.putImageData(data, 0, 0);
  return cv;
}
