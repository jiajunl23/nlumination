/**
 * Hald CLUT (PNG) → CubeLut decoder.
 *
 * The shipped LUT library at /public/luts/{mit,cc-by-sa}/<id>.png uses
 * the HaldCLUT-6 layout (216×216 PNG = 36³ effective LUT). The WebGL
 * pipeline expects an Adobe `.cube`-shaped CubeLut object, so this
 * module converts the PNG pixel grid into the same B-major→G-major→
 * R-major Float32Array layout that `parseCube()` produces.
 *
 * Layout math (Hald level N, total side = N³ pixels, lutSize = N²):
 *
 *   linear_idx = R + G·N² + B·N⁴
 *   pixel (x, y) = (linear_idx mod N³, linear_idx ÷ N³)
 *   ⇒  R_idx = x mod N²
 *      G_idx = (x ÷ N²) + (y mod N) · N
 *      B_idx = y ÷ N
 *
 * Cached per-id so repeated re-applies (e.g. switching back to a recent
 * LUT) skip the fetch + decode work.
 */
import type { CubeLut } from "./lut-loader";

const cache = new Map<string, CubeLut>();
const inflight = new Map<string, Promise<CubeLut>>();

/**
 * Resolve a manifest id (e.g. "t3-color-negative-kodak-portra-400" or
 * "rt-color-creativepack-1-tealorange") to its public URL.
 *
 * Bundle is encoded in the id prefix: `t3-*` → MIT bundle, anything else
 * (currently `rt-*`) → CC-BY-SA bundle. This avoids round-tripping
 * through manifest.json on every LUT change.
 */
function urlFor(lutId: string): string {
  const bundle = lutId.startsWith("t3-") ? "mit" : "cc-by-sa";
  return `/luts/${bundle}/${lutId}.png`;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`Failed to load LUT image: ${url}`));
    img.src = url;
  });
}

function decode(img: HTMLImageElement): CubeLut {
  const sidePx = img.naturalWidth;
  if (sidePx !== img.naturalHeight) {
    throw new Error(
      `LUT image not square: ${sidePx}×${img.naturalHeight}`,
    );
  }
  const N = Math.round(Math.cbrt(sidePx));
  if (N * N * N !== sidePx) {
    throw new Error(`Not a HaldCLUT geometry: side=${sidePx}px`);
  }
  const lutSize = N * N;

  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(sidePx, sidePx)
      : Object.assign(document.createElement("canvas"), {
          width: sidePx,
          height: sidePx,
        });
  const ctx = (
    canvas as OffscreenCanvas
  ).getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("haldClut: no 2d context for decoding");

  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, sidePx, sidePx).data;

  const data = new Float32Array(lutSize * lutSize * lutSize * 3);
  let out = 0;
  for (let bIdx = 0; bIdx < lutSize; bIdx++) {
    const yBase = bIdx * N;
    for (let gIdx = 0; gIdx < lutSize; gIdx++) {
      const yOff = (gIdx / N) | 0;
      const xBase = (gIdx % N) * lutSize;
      const y = yBase + yOff;
      for (let rIdx = 0; rIdx < lutSize; rIdx++) {
        const x = rIdx + xBase;
        const i = (y * sidePx + x) * 4;
        data[out++] = px[i] / 255;
        data[out++] = px[i + 1] / 255;
        data[out++] = px[i + 2] / 255;
      }
    }
  }

  return {
    size: lutSize,
    domain: { min: [0, 0, 0], max: [1, 1, 1] },
    data,
  };
}

/**
 * Load + decode a HaldCLUT PNG by manifest id. Cached.
 *
 * Throws on network or decoding failure — caller is expected to log and
 * fall back to `setLut(null)` so the slider stage runs alone.
 */
export async function loadHaldClutByLutId(lutId: string): Promise<CubeLut> {
  const cached = cache.get(lutId);
  if (cached) return cached;
  const ongoing = inflight.get(lutId);
  if (ongoing) return ongoing;

  const url = urlFor(lutId);
  const promise = loadImage(url)
    .then((img) => {
      const lut = decode(img);
      cache.set(lutId, lut);
      inflight.delete(lutId);
      return lut;
    })
    .catch((err) => {
      inflight.delete(lutId);
      throw err;
    });
  inflight.set(lutId, promise);
  return promise;
}

/** Drop the in-memory cache. Useful for teardown / testing. */
export function clearHaldClutCache(): void {
  cache.clear();
  inflight.clear();
}
