import "server-only";
import OpenAI from "openai";
import { getGroqForState, GROQ_MODEL } from "../groq";
import { SYSTEM_PROMPT_ACTION, buildActionUserPrompt } from "../prompts";
import { LLMDelta } from "@/lib/nlp/llm-schema";
import type { AgentState } from "../state";

/**
 * A3 — action agent. Single-shot json_object completion (no ReAct loop,
 * no tool call). Reads A1+A2's plain-text briefs, the raw user prompt,
 * and the current params; emits an LLMDelta JSON.
 *
 * Reasoning_effort changed from "medium" → "low" after live debugging
 * showed Groq returning `400 Failed to validate JSON` on compound prompts.
 * Diagnosis: medium reasoning on gpt-oss-20b can use 700-1000 hidden
 * tokens; combined with a 200-350-token visible JSON delta, the previous
 * `max_tokens: 1280` was being hit MID-EMISSION → truncated JSON →
 * Groq's syntax check rejects → 400 reaches the user. Slight quality
 * regression on field count vs medium reasoning, but reliability matters
 * more than ±2 fields. `max_tokens` also raised so even a verbose
 * outlier has plenty of headroom.
 */
export async function actionAgent(state: AgentState): Promise<void> {
  const groq = getGroqForState(state);
  if (!groq) {
    state.error = "groq_not_configured";
    state.trace.push({
      node: "actionAgent",
      ok: false,
      error: "groq_not_configured",
    });
    return;
  }

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.2,
      // Generous ceiling — `reasoning_effort` controls actual cost, this
      // is just headroom so a long reasoning pass + a 14-field delta
      // never truncates mid-emission.
      max_tokens: 2048,
      // "low" not "medium" — see header comment. Ships ~200-300 reasoning
      // tokens instead of 700-1000, eliminates the truncation class of
      // 400 errors entirely.
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT_ACTION },
        {
          role: "user",
          content: buildActionUserPrompt(
            state.userPrompt,
            state.emotionAnalysis,
            state.imageMood,
            state.currentParams,
            state.history,
            state.lutCandidates,
            state.gradeMode,
          ),
        },
      ],
    });
    state.callCount += 1;

    const raw = completion.choices[0]?.message.content?.trim() ?? "";
    if (!raw) throw new Error("empty action response");
    const parsed = JSON.parse(raw);
    const delta = LLMDelta.parse(parsed);
    state.finalDelta = delta;
    state.trace.push({
      node: "actionAgent",
      ok: true,
      summary: delta.reasoning?.slice(0, 160),
    });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      const errBody = (err as { error?: unknown }).error as
        | { failed_generation?: string }
        | undefined;
      console.error(
        "[actionAgent] Groq APIError:",
        err.status,
        err.message,
        errBody?.failed_generation
          ? `\nfailed_generation: ${errBody.failed_generation.slice(0, 800)}`
          : "",
      );
    } else {
      console.error("[actionAgent] error:", err);
    }
    state.error = "actionAgent_failed";
    state.trace.push({
      node: "actionAgent",
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
  }
}
