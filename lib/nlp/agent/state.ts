/**
 * AgentState — shared memory for one agents-mode user request.
 *
 * Layout: three input fields (frozen at request start), two analyst
 * outputs (filled by A1/A2 nodes — plain strings now, not nested
 * structured JSON), a final delta, and a trace breadcrumb log.
 *
 * Mutation policy: nodes mutate `state` in place (push to messages/trace,
 * assign scalars). Pure-functional copying isn't worth the cost here —
 * GradingParams is deeply nested and the state object never escapes
 * runAgentsPipeline().
 */

import type { GradingParams } from "@/lib/grading/params";
import type { ImageStats } from "@/lib/grading/imageStats";
import type { LLMDeltaT } from "@/lib/nlp/llm-schema";

/**
 * Per-node breadcrumb. Shipped to the client so ChatPanel renders the
 * agent's "thinking trail". NEVER fed back to the LLM.
 */
export type TraceEntry =
  | { node: "emotionAnalyst"; ok: boolean; summary?: string; error?: string }
  | { node: "imageMoodAnalyst"; ok: boolean; summary?: string; error?: string }
  | { node: "actionAgent"; ok: boolean; summary?: string; error?: string }
  | { node: "fallback"; reason: string };

export interface AgentState {
  // ── Inputs (read-only after init) ──────────────────────────────
  userPrompt: string;
  currentParams: GradingParams;
  imageStats: ImageStats | null;

  // ── Analyst outputs ────────────────────────────────────────────
  // A1 returns 1-2 sentences describing emotional/aesthetic intent.
  // A2 returns 1 sentence describing the photo's current style/headroom.
  // null = analyst failed; A3 falls back to raw user prompt / stats.
  emotionAnalysis: string | null;
  imageMood: string | null;

  // ── Terminal state ─────────────────────────────────────────────
  finalDelta: LLMDeltaT | null;
  /** Non-null = unrecoverable; route falls back to single-shot. */
  error: string | null;
  trace: TraceEntry[];

  // ── Billing ────────────────────────────────────────────────────
  /** Number of LLM calls consumed by this pipeline so far. Read by route. */
  callCount: number;
}

export interface InitialStateInput {
  userPrompt: string;
  currentParams: GradingParams;
  imageStats: ImageStats | null;
}

export function initialState(input: InitialStateInput): AgentState {
  return {
    userPrompt: input.userPrompt,
    currentParams: input.currentParams,
    imageStats: input.imageStats,
    emotionAnalysis: null,
    imageMood: null,
    finalDelta: null,
    error: null,
    trace: [],
    callCount: 0,
  };
}
