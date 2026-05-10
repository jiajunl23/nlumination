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
import type { LutCandidate } from "@/lib/nlp/lut-retrieve";

/**
 * Grading mode toggle, plumbed from the client.
 *
 *   - "auto"   : A3 picks LUT or pure slider based on prompt and similarity
 *   - "lut"    : A3 must seed with the top LUT candidate (retrieval-driven)
 *   - "slider" : A3 must NOT emit a lutId (legacy slider-only behavior)
 *
 * Default is "auto" so the pipeline behaves identically to v3 when the
 * client doesn't send the field.
 */
export type GradeMode = "auto" | "lut" | "slider";

/**
 * Per-node breadcrumb. Shipped to the client so ChatPanel renders the
 * agent's "thinking trail". NEVER fed back to the LLM.
 */
export type TraceEntry =
  | { node: "emotionAnalyst"; ok: boolean; summary?: string; error?: string }
  | {
      node: "imageMoodAnalyst";
      ok: boolean;
      /** "vlm" if Llama-4-Scout was tried, "stats" if numeric ImageStats. */
      path?: "vlm" | "stats";
      summary?: string;
      error?: string;
    }
  | {
      node: "lutRetriever";
      ok: boolean;
      /** Top-K candidate ids + cosine scores; null if retrieval failed. */
      candidates?: { id: string; score: number }[];
      error?: string;
    }
  | { node: "actionAgent"; ok: boolean; summary?: string; error?: string }
  | { node: "fallback"; reason: string };

/**
 * One prior turn's worth of context. The client tracks these in the
 * editor session and ships the most recent N (after server-side trim)
 * with each request so refinements ("warmer still", "undo that contrast")
 * read as part of a chain rather than a fresh prompt.
 */
export interface TurnRecord {
  prompt: string;
  paramsBefore: GradingParams;
  delta: LLMDeltaT;
  paramsAfter: GradingParams;
  timestamp: number;
}

export interface AgentState {
  // ── Inputs (read-only after init) ──────────────────────────────
  userPrompt: string;
  currentParams: GradingParams;
  imageStats: ImageStats | null;
  history: TurnRecord[];
  /** BYO Groq key, threaded from request header. Null = use shared env. */
  userApiKey: string | null;
  /**
   * Image source for the VLM analyst. Either a Cloudinary CDN URL (saved
   * photo) or a `data:image/jpeg;base64,...` blob (fresh upload). Null =
   * imageMoodAnalyst falls back to the numeric ImageStats path.
   */
  imageUrl: string | null;
  /** Toggle between LUT tool-selection, slider-only, and auto-decide. */
  gradeMode: GradeMode;
  /** Top-K LUT candidates from cosine retrieval — injected into A3 prompt. */
  lutCandidates: LutCandidate[];

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
  history?: TurnRecord[];
  userApiKey?: string | null;
  imageUrl?: string | null;
  gradeMode?: GradeMode;
  lutCandidates?: LutCandidate[];
}

export function initialState(input: InitialStateInput): AgentState {
  return {
    userPrompt: input.userPrompt,
    currentParams: input.currentParams,
    imageStats: input.imageStats,
    history: input.history ?? [],
    userApiKey: input.userApiKey ?? null,
    imageUrl: input.imageUrl ?? null,
    gradeMode: input.gradeMode ?? "auto",
    lutCandidates: input.lutCandidates ?? [],
    emotionAnalysis: null,
    imageMood: null,
    finalDelta: null,
    error: null,
    trace: [],
    callCount: 0,
  };
}
