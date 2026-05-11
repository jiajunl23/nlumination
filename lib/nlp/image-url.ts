import "server-only";

/**
 * SSRF / abuse defence for the imageUrl field on /api/nlp/interpret.
 *
 * The pipeline forwards this URL to Groq's Llama-4-Scout VLM, which then
 * **fetches whatever URL we send**. Without validation a logged-in user can:
 *   - Make Groq fetch arbitrary remote content (free open VLM proxy)
 *   - Burn Groq image-token quota by pointing at very large remote JPEGs
 *   - Probe internal/private networks from Groq's egress (low impact, but
 *     still ugly)
 *
 * Only two shapes are accepted:
 *   1. https://res.cloudinary.com/<OUR_CLOUD_NAME>/image/upload/...     (saved photos)
 *   2. data:image/(jpeg|png|webp);base64,<base64>                       (fresh uploads)
 *
 * Anything else returns null and the caller should fall back to the
 * numeric ImageStats path.
 */

const ALLOWED_DATA_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,",
];

export function isAllowedImageUrl(
  url: string,
  cloudName: string,
): boolean {
  if (url.length > 200_000) return false;

  if (ALLOWED_DATA_PREFIXES.some((p) => url.startsWith(p))) {
    return true;
  }

  // Strict prefix match — no host-spoofing via path tricks (e.g.
  // "https://res.cloudinary.com.attacker.com/..." or
  // "https://res.cloudinary.com@attacker.com/..."). Both fail because we
  // require the exact prefix including the path segment that begins with
  // the cloud name. Using URL parsing would also work but introduces its
  // own footguns (relative URLs, weird schemes, percent-encoded hosts).
  if (!cloudName) return false;
  const prefix = `https://res.cloudinary.com/${cloudName}/`;
  return url.startsWith(prefix);
}
