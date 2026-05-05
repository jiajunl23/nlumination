import "server-only";
import OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getGroq, GROQ_MODEL } from "../groq";
import { SYSTEM_PROMPT_EMOTION, buildEmotionUserPrompt } from "../prompts";
import { EmotionAnalysis, EMOTION_ANALYSIS_JSON_SCHEMA } from "../schemas";
import type { AgentState } from "../state";

// Output via a forced tool call rather than `response_format: json_schema`.
// Groq's structured-output generator occasionally gives up on the latter
// ("Failed to generate JSON") under nested schemas, but tool-arg
// constrained decoding has been reliable. Side benefit: this matches the
// pattern already used by the action agent (submitFinalDelta).
const SUBMIT_TOOL_NAME = "submitEmotionAnalysis";
const SUBMIT_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: SUBMIT_TOOL_NAME,
    description:
      "Submit your emotion analysis. The args of this call ARE the final answer.",
    parameters: EMOTION_ANALYSIS_JSON_SCHEMA,
  },
};

/**
 * Single-shot LLM call: user prompt → structured emotion analysis JSON.
 * Failure mode: leaves state.emotionAnalysis at null and pushes an error
 * trace; A3 will fall back to inferring from raw user prompt.
 *
 * `state.callCount` only ticks up once Groq returned a response — if the
 * SDK throws (network/auth/5xx), the user isn't billed.
 */
export async function emotionAnalyst(state: AgentState): Promise<void> {
  const groq = getGroq();
  if (!groq) {
    state.trace.push({
      node: "emotionAnalyst",
      ok: false,
      error: "groq_not_configured",
    });
    return;
  }

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 2048,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_EMOTION },
        { role: "user", content: buildEmotionUserPrompt(state.userPrompt) },
      ],
      tools: [SUBMIT_TOOL],
      tool_choice: {
        type: "function",
        function: { name: SUBMIT_TOOL_NAME },
      },
    });
    state.callCount += 1;

    const tc = completion.choices[0]?.message.tool_calls?.find(
      (t): t is Extract<typeof t, { type: "function" }> =>
        t.type === "function" && t.function.name === SUBMIT_TOOL_NAME,
    );
    if (!tc) throw new Error("emotion analyst returned no tool call");
    const parsed = JSON.parse(tc.function.arguments || "{}");
    const validated = EmotionAnalysis.parse(parsed);
    state.emotionAnalysis = validated;
    state.trace.push({
      node: "emotionAnalyst",
      ok: true,
      summary: validated.summary,
    });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      const errBody = (err as { error?: unknown }).error as
        | { failed_generation?: string }
        | undefined;
      console.error(
        "[emotionAnalyst] Groq APIError:",
        err.status,
        err.message,
        errBody?.failed_generation
          ? `\nfailed_generation: ${errBody.failed_generation.slice(0, 800)}`
          : "",
      );
    } else {
      console.error("[emotionAnalyst] error:", err);
    }
    state.trace.push({
      node: "emotionAnalyst",
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
  }
}
