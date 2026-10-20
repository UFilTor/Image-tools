/**
 * Web worker for AI background removal: transformers.js running onnx-community/ormbg-ONNX
 * (Apache-2.0, an ISNet-based general-object segmenter). The q8 weights (~44 MB) download from
 * Hugging Face on first use and the browser caches them. Same raw-buffer protocol as the
 * upscale worker: RGBA in, alpha mask out (transferred, not copied). Images never leave the
 * browser.
 */

import { pipeline, RawImage } from "@huggingface/transformers";
import { errorMessage, userMessage } from "./errors";

export interface BgWorkerRequest {
  id: number;
  rgba: ArrayBuffer;
  width: number;
  height: number;
}

export type BgWorkerResponse =
  | { type: "progress"; id: number; pct: number }
  | { type: "done"; id: number; alpha: ArrayBuffer }
  | { type: "error"; id: number; message: string };

const MODEL_ID = "onnx-community/ormbg-ONNX";

let currentId = 0;

function send(msg: BgWorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(msg, { transfer });
}

function loadSegmenter() {
  return pipeline("background-removal", MODEL_ID, {
    dtype: "q8",
    progress_callback: (info) => {
      // Config files are tiny; only the weights download is worth a progress bar.
      if (info.status === "progress" && info.file.endsWith(".onnx")) {
        send({ type: "progress", id: currentId, pct: info.progress });
      }
    },
  });
}

let segmenter: ReturnType<typeof loadSegmenter> | null = null;

self.addEventListener("message", async (e: MessageEvent<BgWorkerRequest>) => {
  const { id, rgba, width, height } = e.data;
  currentId = id;
  let seg: Awaited<ReturnType<typeof loadSegmenter>>;
  try {
    segmenter ??= loadSegmenter();
    seg = await segmenter;
  } catch (err: unknown) {
    segmenter = null; // let the next attempt retry the download
    send({ type: "error", id, message: `Couldn't load the AI model: ${userMessage(err)}` });
    return;
  }

  try {
    const out = await seg(new RawImage(new Uint8ClampedArray(rgba), width, height, 4));
    if (out.width !== width || out.height !== height || out.channels !== 4) {
      throw new Error(`Unexpected mask ${out.width}x${out.height}x${out.channels}`);
    }
    const alpha = new Uint8Array(width * height);
    for (let p = 0; p < alpha.length; p++) alpha[p] = out.data[p * 4 + 3];
    send({ type: "done", id, alpha: alpha.buffer }, [alpha.buffer]);
  } catch (err: unknown) {
    send({ type: "error", id, message: errorMessage(err) });
  }
});
