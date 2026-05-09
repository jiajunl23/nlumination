/**
 * Prepare an image for a vision-LLM call. Returns either the photo's
 * Cloudinary CDN URL (preferred — server doesn't have to host bytes) or
 * a downsampled base64 data URL when the photo hasn't been saved yet.
 *
 * Sized to 384x384 contain-fit. Llama-4-Scout charges per image tile; a
 * 384px image fits in ~600-800 tokens, plenty of detail for "describe
 * the photo's mood and lighting in 40 words" without burning budget.
 *
 * Client-side only — uses OffscreenCanvas (with HTMLCanvasElement
 * fallback) and the browser's JPEG encoder.
 */

const MAX_DIM = 384;
const JPEG_QUALITY = 0.8;

export type VlmImage =
  | { url: string; kind: "cloudinary" }
  | { url: string; kind: "base64" };

export async function prepareVlmImage(
  source: ImageBitmap,
  cloudinaryUrl: string | null,
): Promise<VlmImage> {
  // Saved photos: just hand Groq the public CDN URL. Cheaper and
  // faster — no client → server payload, no re-encode.
  if (cloudinaryUrl) return { url: cloudinaryUrl, kind: "cloudinary" };

  // Fresh upload: contain-fit downsample, JPEG-encode, base64.
  const { w, h } = containFit(source.width, source.height, MAX_DIM);

  // Prefer OffscreenCanvas where available (works off-thread potential
  // and avoids touching the DOM); fall back to a detached <canvas>.
  let blob: Blob;
  if (typeof OffscreenCanvas !== "undefined") {
    const off = new OffscreenCanvas(w, h);
    const ctx = off.getContext("2d");
    if (!ctx) throw new Error("offscreen 2d context unavailable");
    ctx.drawImage(source, 0, 0, w, h);
    blob = await off.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  } else {
    const cnv = document.createElement("canvas");
    cnv.width = w;
    cnv.height = h;
    const ctx = cnv.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(source, 0, 0, w, h);
    blob = await new Promise<Blob>((resolve, reject) => {
      cnv.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
  }

  const dataUrl = await blobToDataUrl(blob);
  return { url: dataUrl, kind: "base64" };
}

function containFit(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { w, h };
  const ar = w / h;
  return ar > 1
    ? { w: max, h: Math.round(max / ar) }
    : { w: Math.round(max * ar), h: max };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("FileReader failed"));
    r.readAsDataURL(blob);
  });
}
