/**
 * Web worker for AI upscaling. Runs TensorFlow.js + ESRGAN off the main thread
 * so the page stays responsive during inference. This unlocks the heavier
 * esrgan-thick model (best quality) for genuine upscaling — on the main thread
 * it would freeze the tab. Enhance mode still uses esrgan-medium because its
 * sources are much larger and thick would take minutes on them.
 *
 * Workers have no Image/document, so the protocol is raw buffers: the page
 * sends packed RGB + dimensions, the worker returns RGBA pixels (transferred,
 * not copied). See UpscalerJS's webworker example — tensor in, tensor out.
 */

import { tensorToRGBA } from "./upscale-tensor";

export type WorkerModelKey = "up-x2" | "up-x4" | "enh-x2";

export interface WorkerRequest {
  id: number;
  rgb: ArrayBuffer;
  width: number;
  height: number;
  modelKey: WorkerModelKey;
  patchSize: number;
  padding: number;
}

export type WorkerResponse =
  | { type: "progress"; id: number; pct: number }
  | { type: "done"; id: number; pixels: ArrayBuffer; width: number; height: number }
  | { type: "error"; id: number; message: string };

// postMessage with a transfer list — the Worker interface has the right signature.
const ctx = self as unknown as Worker;

type UpscalerInstance = {
  upscale: (src: unknown, opts: Record<string, unknown>) => Promise<unknown>;
};
const instances: Partial<Record<WorkerModelKey, UpscalerInstance>> = {};

async function getUpscaler(key: WorkerModelKey): Promise<UpscalerInstance> {
  const existing = instances[key];
  if (existing) return existing;

  await import("@tensorflow/tfjs");
  const Upscaler = (await import("upscaler")).default as unknown as new (opts: {
    model: unknown;
  }) => UpscalerInstance;

  // Genuine upscaling gets esrgan-thick (highest quality ESRGAN variant);
  // enhance keeps esrgan-medium for speed on large sources. Both export the
  // scale models as named members (x2, x4) on the module namespace.
  const models =
    key === "enh-x2"
      ? ((await import("@upscalerjs/esrgan-medium")) as unknown as { x2: unknown; x4: unknown })
      : ((await import("@upscalerjs/esrgan-thick")) as unknown as { x2: unknown; x4: unknown });
  const model = key === "up-x4" ? models.x4 : models.x2;
  const instance = new Upscaler({ model });
  instances[key] = instance;
  return instance;
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, rgb, width, height, modelKey, patchSize, padding } = e.data;
  try {
    // tfjs's WebGL backend needs OffscreenCanvas in a worker; without it we'd
    // silently fall back to CPU and take minutes. Bail so the page-side
    // fallback (main-thread WebGL) takes over instead.
    if (typeof OffscreenCanvas === "undefined") {
      throw new Error("OffscreenCanvas unavailable in worker");
    }

    const tf = await import("@tensorflow/tfjs");
    const upscaler = await getUpscaler(modelKey);

    const input = tf.tensor3d(new Uint8Array(rgb), [height, width, 3], "int32");
    let tensor: unknown;
    try {
      tensor = await upscaler.upscale(input, {
        output: "tensor",
        patchSize,
        padding,
        progress: (rate: number, slice?: { dispose?: () => void }) => {
          slice?.dispose?.();
          ctx.postMessage({ type: "progress", id, pct: Math.round(rate * 100) });
        },
      });
    } finally {
      input.dispose();
    }

    const t = tensor as Parameters<typeof tensorToRGBA>[1];
    try {
      const res = await tensorToRGBA(tf as unknown as Parameters<typeof tensorToRGBA>[0], t);
      ctx.postMessage(
        { type: "done", id, pixels: res.pixels.buffer, width: res.width, height: res.height },
        [res.pixels.buffer],
      );
    } finally {
      t.dispose();
    }
  } catch (err) {
    ctx.postMessage({
      type: "error",
      id,
      message: err instanceof Error ? err.message : "Upscaling failed in worker",
    });
  }
};
