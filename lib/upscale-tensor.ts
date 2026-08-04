/**
 * Shared tensor post-processing for the upscale pipeline. Imported by both the
 * web worker and the main-thread fallback so the two paths produce identical
 * output. Takes the raw model output tensor and returns plain RGBA pixels —
 * no canvas involved, so it runs anywhere.
 */

// Structural types so this module doesn't force tfjs into every importer's graph.
interface TensorLike {
  shape: number[];
  data: () => Promise<ArrayLike<number>>;
  dispose: () => void;
  max: () => TensorLike;
  mul: (n: number) => TensorLike;
  clipByValue: (lo: number, hi: number) => TensorLike;
  cast: (dtype: string) => TensorLike;
}

interface TfLike {
  tidy: <T>(fn: () => T) => T;
}

export interface RGBAResult {
  // Explicit ArrayBuffer generic: ImageData rejects Uint8ClampedArray<ArrayBufferLike>.
  pixels: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

/**
 * Convert a model output tensor (h × w × 3, float) into an opaque RGBA buffer.
 * Some models return normalized [0,1] output — detect via the max value and
 * denormalize so we never render black. (Known trade-off: a frame whose true
 * max pixel value is below ~2/255 would be misdetected, but that is an
 * essentially black image to begin with.)
 */
export async function tensorToRGBA(tf: TfLike, tensor: TensorLike): Promise<RGBAResult> {
  const maxT = tf.tidy(() => tensor.max());
  let maxVal: number;
  try {
    maxVal = (await maxT.data())[0];
  } finally {
    maxT.dispose();
  }

  const pixels = tf.tidy(() => {
    let t = tensor;
    if (maxVal <= 1.5) t = t.mul(255);
    return t.clipByValue(0, 255).cast("int32");
  });
  try {
    const [height, width] = tensor.shape;
    const flat = await pixels.data();
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let p = 0, i = 0; p < width * height; p++, i += 3) {
      rgba[p * 4] = flat[i];
      rgba[p * 4 + 1] = flat[i + 1];
      rgba[p * 4 + 2] = flat[i + 2];
      rgba[p * 4 + 3] = 255;
    }
    return { pixels: rgba, width, height };
  } finally {
    pixels.dispose();
  }
}
