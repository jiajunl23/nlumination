import "server-only";
import { randomUUID } from "node:crypto";
import {
  cloudinary,
  cloudinaryApiKey,
  cloudinaryCloudName,
} from "./cloudinary";

export type SignedUpload = {
  /** POST the file (multipart/form-data) to this URL. */
  uploadUrl: string;
  /** Form fields to include alongside `file=<blob>`. */
  params: Record<string, string>;
};

/**
 * Generate a one-shot signed upload payload. The browser then does:
 *   const fd = new FormData();
 *   fd.append("file", blob);
 *   for (const [k, v] of Object.entries(params)) fd.append(k, v);
 *   await fetch(uploadUrl, { method: "POST", body: fd });
 *
 * Cloudinary returns { public_id, secure_url, width, height, format, ... }.
 */
// Security: restrict uploads to image bitmaps Cloudinary can decode safely.
// Without `allowed_formats`, a logged-in user could upload SVG-with-embedded-JS
// or arbitrary HTML — Cloudinary may serve those with a content-type that lets
// them execute (XSS surface). Whitelisting locks the resource_type and forces
// Cloudinary to reject anything that doesn't pass image-format detection.
const ALLOWED_FORMATS = "jpg,jpeg,png,webp";

export function signUpload(args: { userId: string; folder?: string }): SignedUpload {
  const folder = `${args.folder ?? "nlumination"}/${args.userId}`;
  const publicId = randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);

  // The signature must cover every parameter we send, sorted alphabetically.
  // `api_sign_request` handles this for us.
  const signature = cloudinary.utils.api_sign_request(
    {
      allowed_formats: ALLOWED_FORMATS,
      folder,
      public_id: publicId,
      resource_type: "image",
      timestamp,
    },
    process.env.CLOUDINARY_API_SECRET ?? "",
  );

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/upload`,
    params: {
      allowed_formats: ALLOWED_FORMATS,
      api_key: cloudinaryApiKey,
      folder,
      public_id: publicId,
      resource_type: "image",
      signature,
      timestamp: String(timestamp),
    },
  };
}
