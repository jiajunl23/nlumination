/**
 * runAgentsPipeline — the multi-agent equivalent of LangGraph's
 * `graph.compile().invoke()`. Wires three nodes:
 *
 *   ┌─ emotionAnalyst (A1) ─┐
 *   │                       ├─→ actionAgent (A3) ─→ finalDelta
 *   └─ imageMoodAnalyst(A2)─┘
 *
 * A1 and A2 are independent → run with Promise.all (≈ 1× analyst latency
 * not 2×). A3 reads both outputs and synthesises the final delta.
 *
 * Caller is responsible for charging `state.callCount` to the user's
 * quota after this resolves.
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

export async function runAgentsPipeline(
  input: InitialStateInput,
): Promise<AgentState> {
  const state = initialState(input);

  // Parallel analyst phase. We don't bail if one analyst fails —
  // the action agent is built to degrade gracefully.
  await Promise.all([emotionAnalyst(state), imageMoodAnalyst(state)]);

  await actionAgent(state);

  return state;
}
