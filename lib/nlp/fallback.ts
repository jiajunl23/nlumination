/**
 * Fallback: when the user types something we couldn't match, find the top-N
 * closest known intent phrases and surface them as suggestions.
 *
 * Distance is character-level Levenshtein, which works tolerably for both
 * Chinese (each glyph is a token) and English (a typo costs one edit).
 */

import { INTENTS } from "./intents";

type Suggestion = {
  phrase: string;
  description: string;
  score: number;
};

export function suggestForUnmatched(
  unmatched: string[],
  topN = 3,
): Suggestion[] {
  if (unmatched.length === 0) return [];
  const queries = unmatched
    .map((s) => s.replace(/\s+/g, "").trim())
    .filter((s) => s.length > 0);
  if (queries.length === 0) return [];

  // Flatten all (phrase, description) pairs once.
  const pool: { phrase: string; description: string }[] = [];
  for (const intent of INTENTS) {
    for (const p of intent.phrases) {
      pool.push({ phrase: p, description: intent.description });
    }
  }

  const seen = new Set<string>();
  const scored: Suggestion[] = [];
  for (const q of queries) {
    for (const item of pool) {
      const dedupe = `${item.description}::${item.phrase}`;
      if (seen.has(dedupe)) continue;
      const dist = levenshtein(q, item.phrase);
      const score = dist / Math.max(q.length, item.phrase.length);
      if (score < 0.7) {
        scored.push({ ...item, score });
        seen.add(dedupe);
      }
    }
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, topN);
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
