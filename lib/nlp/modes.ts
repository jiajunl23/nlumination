/**
 * Single source of truth for the three NL interpretation modes and their
 * cost model. Everything that touches mode/budget — ChatPanel, route,
 * quota, week3.md — should read these constants instead of hardcoding.
 *
 * `auto` is a CLIENT-SIDE strategy: try the local parser first, fall back
 * to a `mode: "llm"` request only when nothing matched. The server only
 * sees `llm` or `agents`. Auto's `estimated` cost is the LLM-fallback cost.
 *
 * `agents` is the multi-agent pipeline: 2 calls (analysts only, A3 single
 * shot) up to 3 calls (A3 also calls applyPreset). We bill the actual
 * count post-hoc — `estimated` is just the upfront budget guard.
 */

export type Mode = "auto" | "llm" | "agents";

export type ServerMode = Exclude<Mode, "auto">;

export interface ModeCost {
  /** Upper bound used to gate the request before any LLM call. */
  estimated: number;
  /** Display label in the toggle. */
  label: string;
  /** Tooltip / hint shown under the toggle button. */
  hint: string;
}

export const MODE_COST: Record<Mode, ModeCost> = {
  auto: {
    estimated: 1,
    label: "Auto",
    hint: "Parser first, LLM as fallback (~0–1 calls)",
  },
  llm: {
    estimated: 1,
    label: "LLM",
    hint: "Single LLM → JSON (1 call)",
  },
  agents: {
    estimated: 4,
    label: "Agents",
    hint: "Emotion + Image analysts → Action (3–4 calls)",
  },
};

/** Per-user daily budget, expressed in LLM calls (not user requests). */
export const DAILY_LLM_LIMIT = 100;

/**
 * Old localStorage value — pre-multi-agent the toggle was 2-way (auto / ai).
 * We migrate `"ai"` → `"llm"` on read so existing users don't lose their
 * preference. Once the value is `"auto" | "llm" | "agents"` we just
 * round-trip it.
 */
export function normalizeStoredMode(stored: string | null): Mode {
  if (stored === "ai") return "llm";
  if (stored === "auto" || stored === "llm" || stored === "agents") return stored;
  return "auto";
}
