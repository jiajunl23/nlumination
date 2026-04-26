/**
 * Client-side upload orchestration.
 *
 *   1. Re-encode the source ImageBitmap into a JPEG (cap long edge at 4096 px).
 *   2. Ask the server for a Cloudinary signed-upload payload.
 *   3. POST the file directly to Cloudinary.
 *   4. Tell our server to record the photo + initial edit.
 *
 * Cloudinary serves the thumbnail on demand via a URL transformation
 * (`c_limit,w_720,q_auto,f_auto`), so we don't upload a thumb separately.
 */

import type { GradingParams } from "@/lib/grading/params";

export type SavedPhoto = {
  id: string;
  filename: string;
  width: number;
  height: number;
  publicId: string;
};

export async function uploadAndCreatePhoto(args: {
  source: ImageBitmap;
  filename: string;
  params: GradingParams;
  prompt: string | null;
}): Promise<{ photo: SavedPhoto }> {
  const blob = await encodeToJpeg(args.source, 4096, 0.95);

  const sign = await signUpload();
  const cloud = await postToCloudinary(sign.uploadUrl, sign.params, blob);

  const res = await fetch("/api/photos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      publicId: cloud.public_id,
      filename: args.filename,
      width: cloud.width,
      height: cloud.height,
      params: args.params,
      prompt: args.prompt,
    }),
  });
  if (!res.ok) throw new Error(`POST /api/photos → ${res.status}`);
  return await res.json();
}

export async function saveEdit(args: {
  photoId: string;
  params: GradingParams;
  prompt: string | null;
}) {
  const res = await fetch("/api/edits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`POST /api/edits → ${res.status}`);
  return await res.json();
}

// ─── helpers ───────────────────────────────────────────────────

type SignResponse = {
  uploadUrl: string;
  params: Record<string, string>;
};

async function signUpload(): Promise<SignResponse> {
  const res = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`POST /api/uploads/sign → ${res.status}`);
  return await res.json();
}

type CloudinaryResponse = {
  public_id: string;
  width: number;
  height: number;
  format: string;
  secure_url: string;
};

async function postToCloudinary(
  url: string,
  params: Record<string, string>,
  blob: Blob,
): Promise<CloudinaryResponse> {
  const fd = new FormData();
  fd.append("file", blob);
  for (const [k, v] of Object.entries(params)) fd.append(k, v);
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cloudinary upload failed (${res.status}): ${body}`);
  }
  return await res.json();
}

async function encodeToJpeg(
  source: ImageBitmap,
  longEdge: number,
  quality: number,
): Promise<Blob> {
  const longest = Math.max(source.width, source.height);
  const scale = longest > longEdge ? longEdge / longest : 1;
  const w = Math.round(source.width * scale);
  const h = Math.round(source.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("encodeToJpeg: no 2d context");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return await canvas.convertToBlob({ type: "image/jpeg", quality });
}
