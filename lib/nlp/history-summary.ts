/**
 * Compact text representation of a turn-history list, fed back to the
 * LLM so refinements ("warmer still", "less dramatic", "undo that
 * contrast bump") read as continuation rather than a cold prompt.
 *
 * Shape per turn (~160 chars):
 *   1. "make warmer" → temperature +15, exposure +0.20
 *
 * Used by both the agents pipeline (prompts.ts) and the single-shot
 * LLM mode (llm-prompt.ts). Kept as a separate module so the two prompt
 * files don't drift in encoding.
 */
import type { GradingParams } from "@/lib/grading/params";
import type { LLMDeltaT } from "@/lib/nlp/llm-schema";
import type { TurnRecord } from "@/lib/nlp/agent/state";

/** Scalar delta fields, in stable display order. */
const SCALAR_KEYS: ReadonlyArray<{ key: keyof LLMDeltaT; label: string }> = [
  { key: "exposure", label: "exposure" },
  { key: "contrast", label: "contrast" },
  { key: "highlights", label: "highlights" },
  { key: "shadows", label: "shadows" },
  { key: "whites", label: "whites" },
  { key: "blacks", label: "blacks" },
  { key: "temperature", label: "temperature" },
  { key: "tint", label: "tint" },
  { key: "vibrance", label: "vibrance" },
  { key: "saturation", label: "saturation" },
  { key: "clarity", label: "clarity" },
  { key: "vignetteAmount", label: "vignette" },
];

/** "exposure +0.20, contrast +15, temperature +18 (+ hsl, splitToning)". */
function summariseDelta(delta: LLMDeltaT): string {
  const parts: string[] = [];
  for (const { key, label } of SCALAR_KEYS) {
    const v = delta[key] as number | undefined;
    if (v === undefined) continue;
    if (Math.abs(v) < 0.005) continue;
    const sign = v > 0 ? "+" : "";
    parts.push(`${label} ${sign}${+v.toFixed(2)}`);
  }
  const hslTouched = delta.hsl
    ? Object.keys(delta.hsl).filter(
        (b) => delta.hsl![b as keyof typeof delta.hsl],
      )
    : [];
  if (hslTouched.length) parts.push(`hsl{${hslTouched.join(",")}}`);
  if (delta.splitToning) parts.push("splitToning");
  return parts.length ? parts.join(", ") : "(no fields changed)";
}

const TRUNCATE_PROMPT_AT = 60;

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

/**
 * Return a single line per turn. Caller controls how many turns are
 * passed in — server-side trim happens in route.ts before this is
 * called, so we don't enforce a max length here.
 */
export function summariseHistory(history: readonly TurnRecord[]): string {
  if (history.length === 0) return "";
  const lines = history.map((t, i) => {
    const prompt = truncate(t.prompt, TRUNCATE_PROMPT_AT);
    return `${i + 1}. "${prompt}" → ${summariseDelta(t.delta)}`;
  });
  return ["PRIOR TURNS (oldest→newest):", ...lines].join("\n");
}

/**
 * Rough char-count estimator used by route.ts trimHistory(). Mirrors
 * the format of summariseHistory() so the trim threshold is meaningful.
 */
export function estimateHistoryChars(history: readonly TurnRecord[]): number {
  if (history.length === 0) return 0;
  // 16 chars header + ~160 per turn average.
  return 16 + history.length * 160;
}

// Re-export so prompts.ts / llm-prompt.ts can grab everything from one path.
export type { TurnRecord, GradingParams };
