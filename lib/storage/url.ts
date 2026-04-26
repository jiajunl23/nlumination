/**
 * URL builders for Cloudinary-hosted images. Safe to import from both
 * server and client: only reads the public cloud-name env var.
 *
 * `originalUrl(publicId)` — full-resolution, JPEG, no transforms.
 * `thumbUrl(publicId)`     — 720 px wide, JPEG, q_auto, f_auto.
 */

const CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ??
  process.env.CLOUDINARY_CLOUD_NAME ??
  "";

const BASE = CLOUD_NAME
  ? `https://res.cloudinary.com/${CLOUD_NAME}/image/upload`
  : "";

export function originalUrl(publicId: string): string {
  if (!BASE || !publicId) return "";
  return `${BASE}/${publicId}`;
}

export function thumbUrl(publicId: string, width = 720): string {
  if (!BASE || !publicId) return "";
  return `${BASE}/c_limit,w_${width},q_auto,f_auto/${publicId}`;
}
