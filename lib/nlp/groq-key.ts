/**
 * Groq API keys look like `gsk_<28+ alphanumerics>`. We validate at the
 * border (client-side before submit, server-side before constructing a
 * client) so an obviously-malformed string doesn't get forwarded to Groq
 * just for it to 401 us.
 *
 * The regex is shared between client and server — keeping the rule in
 * one place avoids drift if Groq ever changes the format.
 */
export const GROQ_KEY_RE = /^gsk_[A-Za-z0-9]{20,}$/;

export function isValidGroqKey(s: unknown): s is string {
  return typeof s === "string" && GROQ_KEY_RE.test(s);
}
