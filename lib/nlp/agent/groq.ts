/**
 * Lazy-initialised Groq client used by every agent node and the
 * single-shot fallback. Constructed on first call so a missing
 * GROQ_API_KEY never crashes module evaluation.
 *
 * Groq is OpenAI-API-compatible — same SDK, different baseURL.
 */
import "server-only";
import OpenAI from "openai";

let cached: OpenAI | null | undefined;

export function getGroq(): OpenAI | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    cached = null;
    return null;
  }
  cached = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });
  return cached;
}

export const GROQ_MODEL = "openai/gpt-oss-20b";
