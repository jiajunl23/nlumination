/**
 * Fallback: when the user types something we couldn't match, find the top-N
 * closest known intent phrases and surface them as suggestions.
 *
 * Scoring (lower = better):
 *   0.00  exact match
 *   0.08  prefix match in either direction ("filmlike" ↔ "film", "movie" ↔ "movie look")
 *   0.18  substring inclusion ("moviestar" contains "movie")
 *   x/L   character-level Levenshtein, normalised by max length
 *
 * We drop very short queries (< 3 chars) and a small stop-word list so that
 * connective fluff like "and", "the", "like", "make" doesn't manufacture
 * spurious "did you mean" suggestions.
 */

import { INTENTS } from "./intents";

type Suggestion = {
  phrase: string;
  description: string;
  score: number;
};

const STOP_WORDS = new Set([
  "a", "an", "the",
  "and", "or", "but", "yet", "so",
  "of", "to", "for", "with", "in", "on", "at", "by", "from",
  "is", "are", "was", "be", "been", "being",
  "it", "its", "this", "that", "these", "those",
  "i", "me", "my", "we", "us", "you", "your",
  "make", "makes", "made", "making",
  "look", "looks", "looking", "feel", "feels", "feeling",
  "like", "as", "kinda", "kind", "sort", "type",
  "want", "wants", "need", "needs",
  "please", "pls", "thx", "thanks",
  "now", "just", "also", "too",
  "really", "very", "super", "extremely", "subtly", "slightly",
]);

function isMeaningful(q: string): boolean {
  if (q.length < 3) return false;
  if (STOP_WORDS.has(q)) return false;
  return true;
}

export function suggestForUnmatched(
  unmatched: string[],
  topN = 3,
): Suggestion[] {
  if (unmatched.length === 0) return [];
  const queries = unmatched
    .map((s) => s.toLowerCase().replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0)
    .filter(isMeaningful);
  if (queries.length === 0) return [];

  const pool: { phrase: string; description: string }[] = [];
  for (const intent of INTENTS) {
    for (const p of intent.phrases) {
      pool.push({ phrase: p, description: intent.description });
    }
  }

  const seenDesc = new Set<string>();
  const scored: Suggestion[] = [];
  for (const q of queries) {
    for (const item of pool) {
      const phrase = item.phrase.toLowerCase();
      let score: number;
      if (q === phrase) {
        score = 0;
      } else if (
        phrase.length >= 3 &&
        (q.startsWith(phrase) || phrase.startsWith(q))
      ) {
        score = 0.08;
      } else if (
        phrase.length >= 4 &&
        q.length >= 4 &&
        (q.includes(phrase) || phrase.includes(q))
      ) {
        score = 0.18;
      } else {
        const dist = levenshtein(q, phrase);
        score = dist / Math.max(q.length, phrase.length);
      }
      if (score < 0.55) {
        scored.push({ ...item, score });
      }
    }
  }

  // Keep one suggestion per intent-description so the user gets variety
  // rather than three phrasings of the same look.
  scored.sort((a, b) => a.score - b.score);
  const out: Suggestion[] = [];
  for (const s of scored) {
    if (seenDesc.has(s.description)) continue;
    seenDesc.add(s.description);
    out.push(s);
    if (out.length >= topN) break;
  }
  return out;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}
