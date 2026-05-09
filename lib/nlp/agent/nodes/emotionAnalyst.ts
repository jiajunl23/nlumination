import "server-only";
import OpenAI from "openai";
import { getGroqForState, GROQ_MODEL } from "../groq";
import { SYSTEM_PROMPT_EMOTION, buildEmotionUserPrompt } from "../prompts";
import type { AgentState } from "../state";

/**
 * A1 — emotion analyst. Plain chat completion. The output is a 1-2 sentence
 * description of the emotional intent / photographic style. No JSON, no
 * tool call — that overhead was the bulk of this node's cost in the
 * earlier structured design.
 *
 * Failure → state.emotionAnalysis stays null; A3 falls back to inferring
 * from the raw user prompt.
 */
export async function emotionAnalyst(state: AgentState): Promise<void> {
  const groq = getGroqForState(state);
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
      temperature: 0.3,
      // Visible output is ~50 tokens but gpt-oss-20b's hidden reasoning
      // shares this budget — give it headroom so reasoning doesn't eat
      // everything before the model emits any text.
      max_tokens: 384,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: SYSTEM_PROMPT_EMOTION },
        {
          role: "user",
          content: buildEmotionUserPrompt(state.userPrompt, state.history),
        },
      ],
    });
    state.callCount += 1;

    const text = completion.choices[0]?.message.content?.trim() ?? "";
    if (!text) throw new Error("empty emotion response");
    state.emotionAnalysis = text;
    state.trace.push({
      node: "emotionAnalyst",
      ok: true,
      summary: text.slice(0, 160),
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
