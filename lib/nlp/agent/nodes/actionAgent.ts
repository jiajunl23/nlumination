import "server-only";
import OpenAI from "openai";
import { getGroq, GROQ_MODEL } from "../groq";
import { SYSTEM_PROMPT_ACTION, buildActionUserPrompt } from "../prompts";
import { LLMDelta } from "@/lib/nlp/llm-schema";
import type { AgentState } from "../state";

/**
 * A3 — action agent. Single-shot json_object completion (no ReAct loop,
 * no tool call). Reads A1+A2's plain-text briefs, the raw user prompt,
 * and the current params; emits an LLMDelta JSON.
 *
 * "moderate" reasoning effort: this is the call that does the actual
 * structured decision-making across many fields, so we keep more
 * reasoning budget than the analysts. Empirically gives noticeably
 * better field coverage on compound prompts than "low".
 */
export async function actionAgent(state: AgentState): Promise<void> {
  const groq = getGroq();
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
      // Reasoning_effort "medium" can use 400-600 hidden tokens; visible
      // JSON delta is 150-250 tokens. Leave headroom so a long reasoning
      // pass doesn't truncate the JSON output (Groq returns 400
      // "Failed to validate JSON" when truncated mid-emission).
      max_tokens: 1280,
      reasoning_effort: "medium",
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
