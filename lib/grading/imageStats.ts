/**
 * Photo statistics used by the NL parser to scale prompt magnitudes
 * relative to the actual image content. Computed once when a photo
 * loads, on a 256-px downsample, in a single pass.
 *
 * Cheap (~5 ms) and CPU-only via OffscreenCanvas — no WebGL pipeline
 * dependency, so stats are ready before the GL upload completes.
 */

export type ImageStats = {
  /** Mean Rec.709 luminance, 0..1. */
  meanLuminance: number;
  /** Std-dev of luminance, 0..~0.5 typical. Proxy for contrast. */
  stdLuminance: number;
  /** Mean linear-ish R/G/B (sRGB-encoded but sufficient for cast detection), 0..1. */
  meanR: number;
  meanG: number;
  meanB: number;
  /** 5th and 95th percentile luminance — true black / white points. */
  p05Luminance: number;
  p95Luminance: number;
};

const TARGET_LONG_EDGE = 256;

export async function computeImageStats(bmp: ImageBitmap): Promise<ImageStats> {
  const ar = bmp.width / bmp.height;
  const w = ar >= 1 ? TARGET_LONG_EDGE : Math.max(1, Math.round(TARGET_LONG_EDGE * ar));
  const h = ar >= 1 ? Math.max(1, Math.round(TARGET_LONG_EDGE / ar)) : TARGET_LONG_EDGE;

  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = (canvas as OffscreenCanvas).getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("imageStats: 2d context unavailable");

  ctx.drawImage(bmp, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const n = w * h;
  let sumL = 0;
  let sumL2 = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  // 256-bin luminance histogram for percentile lookup.
  const hist = new Uint32Array(256);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sumR += r;
    sumG += g;
    sumB += b;
    sumL += lum;
    sumL2 += lum * lum;
    hist[Math.min(255, Math.max(0, Math.round(lum * 255)))] += 1;
  }

  const meanLuminance = sumL / n;
  const variance = Math.max(0, sumL2 / n - meanLuminance * meanLuminance);
  const stdLuminance = Math.sqrt(variance);

  // Percentile lookup via cumulative histogram.
  const p05Target = n * 0.05;
  const p95Target = n * 0.95;
  let cum = 0;
  let p05Bin = 0;
  let p95Bin = 255;
  let p05Set = false;
  for (let i = 0; i < 256; i++) {
    cum += hist[i];
    if (!p05Set && cum >= p05Target) {
      p05Bin = i;
      p05Set = true;
    }
    if (cum >= p95Target) {
      p95Bin = i;
      break;
    }
  }

  return {
    meanLuminance,
    stdLuminance,
    meanR: sumR / n,
    meanG: sumG / n,
    meanB: sumB / n,
    p05Luminance: p05Bin / 255,
    p95Luminance: p95Bin / 255,
  };
}
