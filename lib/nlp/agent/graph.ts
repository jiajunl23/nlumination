/**
 * runAgentsPipeline — the multi-agent equivalent of LangGraph's
 * `graph.compile().invoke()`. Wires four nodes:
 *
 *   ┌─ emotionAnalyst (A1) ──────┐
 *   │                            │
 *   ├─ imageMoodAnalyst (A2)─────┼─→ actionAgent (A3) ─→ finalDelta
 *   │                            │
 *   └─ lutRetriever (tool sel) ──┘
 *
 * A1, A2, and the LUT tool-retrieval all run in parallel via Promise.all
 * (two LLM calls + one embedding call ≈ max(latency) not sum). A3 reads
 * all three outputs and synthesises the final delta — including, when
 * appropriate, a LUT seed picked from the retrieved candidates.
 *
 * NOTE on terminology: this is retrieval-augmented tool selection, not
 * RAG in the Lewis-2020 sense. The retrieved items are tool-catalogue
 * entries (LUTs) that A3 picks from, not knowledge passages it reads
 * to generate an answer.
 *
 * Caller is responsible for charging `state.callCount` to the user's
 * quota after this resolves. Note callCount only counts Groq calls;
 * the embedding call is on HuggingFace's free Inference API and not
 * billed against the user's daily LLM budget.
 */
import "server-only";
import {
  initialState,
  type AgentState,
  type InitialStateInput,
} from "./state";
import { emotionAnalyst } from "./nodes/emotionAnalyst";
import { imageMoodAnalyst } from "./nodes/imageMoodAnalyst";
import { actionAgent } from "./nodes/actionAgent";
import { retrieveLutsStrict } from "@/lib/nlp/lut-retrieve";

const RETRIEVAL_TOP_K = 3;

async function lutRetriever(state: AgentState): Promise<void> {
  // Skip retrieval entirely when the user explicitly forced slider mode.
  if (state.gradeMode === "slider") {
    state.trace.push({
      node: "lutRetriever",
      ok: true,
      candidates: [],
    });
    return;
  }
  try {
    // Combine prompt + history-leading-prompt for slightly richer signal.
    // Using just the user prompt is fine; concatenating the latest history
    // turn gives the embedding hints when the prompt is short ("warmer").
    const recent = state.history.length
      ? ` Prior intent: ${state.history[state.history.length - 1].prompt}.`
      : "";
    const query = state.userPrompt + recent;
    // Strict variant — any embed-API or manifest failure throws here so
    // the trace records `ok: false` instead of silently masquerading as
    // a zero-candidate result. The catch below keeps the request alive
    // (A3 runs without LUT seeds) but the UI now sees the real error.
    const cands = await retrieveLutsStrict(query, RETRIEVAL_TOP_K);
    state.lutCandidates = cands;
    state.trace.push({
      node: "lutRetriever",
      ok: true,
      candidates: cands.map((c) => ({ id: c.id, score: +c.score.toFixed(3) })),
    });
  } catch (err) {
    state.trace.push({
      node: "lutRetriever",
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
    // Non-fatal — continue without LUT seeds.
  }
}

export async function runAgentsPipeline(
  input: InitialStateInput,
): Promise<AgentState> {
  const state = initialState(input);

  // Parallel input phase: A1, A2, and LUT tool-retrieval are independent.
  // A1+A2 are LLM calls (~600ms each); retrieval is one HF embedding
  // call (~50-200ms warm) — total wallclock = max of the three.
  await Promise.all([
    emotionAnalyst(state),
    imageMoodAnalyst(state),
    lutRetriever(state),
  ]);

  await actionAgent(state);

  return state;
}
