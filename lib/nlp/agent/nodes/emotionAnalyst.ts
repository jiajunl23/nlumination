import "server-only";
import OpenAI from "openai";
import { getGroq, GROQ_MODEL } from "../groq";
import { SYSTEM_PROMPT_EMOTION, buildEmotionUserPrompt } from "../prompts";
import { EmotionAnalysis, EMOTION_ANALYSIS_JSON_SCHEMA } from "../schemas";
import type { AgentState } from "../state";

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
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_EMOTION },
        { role: "user", content: buildEmotionUserPrompt(state.userPrompt) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "emotion_analysis",
          strict: false,
          schema: EMOTION_ANALYSIS_JSON_SCHEMA,
        },
      },
    });
    state.callCount += 1;

    const raw = completion.choices[0]?.message.content ?? "{}";
    const parsed = JSON.parse(raw);
    const validated = EmotionAnalysis.parse(parsed);
    state.emotionAnalysis = validated;
    state.trace.push({
      node: "emotionAnalyst",
      ok: true,
      summary: validated.summary,
    });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      console.error(
        "[emotionAnalyst] Groq APIError:",
        err.status,
        err.message,
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
