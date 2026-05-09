/**
 * Lazy-initialised Groq client used by every agent node and the
 * single-shot fallback. Constructed on first call so a missing
 * GROQ_API_KEY never crashes module evaluation.
 *
 * Groq is OpenAI-API-compatible — same SDK, different baseURL.
 */
import "server-only";
import OpenAI from "openai";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

let cached: OpenAI | null | undefined;

/**
 * Default Groq client backed by the shared GROQ_API_KEY env var. Lazy-
 * initialised so a missing key never crashes module evaluation.
 */
export function getGroq(): OpenAI | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    cached = null;
    return null;
  }
  cached = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  return cached;
}

/**
 * Per-request client backed by a user-supplied key (BYO mode). Never
 * cached — different requests can carry different keys, and caching
 * one user's key into the module-level singleton would leak it across
 * users on subsequent requests.
 */
export function getGroqForKey(apiKey: string): OpenAI {
  return new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
}

/**
 * Pick the right client given AgentState. If the request carries a
 * user-supplied key, we use it. Otherwise we fall back to the shared
 * env-var-backed client. Returns null only if BOTH paths are empty.
 */
export function getGroqForState(state: {
  userApiKey?: string | null;
}): OpenAI | null {
  if (state.userApiKey) return getGroqForKey(state.userApiKey);
  return getGroq();
}

export const GROQ_MODEL = "openai/gpt-oss-20b";

/**
 * Vision-capable model on Groq. Currently in preview — keep numeric
 * imageMoodAnalyst path as fallback in case the id changes or Groq
 * retires it. Llama-4-Scout has its own 500K TPD bucket on free tier
 * (independent from gpt-oss-20b's 200K).
 */
export const GROQ_VLM_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
