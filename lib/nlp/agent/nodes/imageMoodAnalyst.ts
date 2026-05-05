import "server-only";
import OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getGroq, GROQ_MODEL } from "../groq";
import { SYSTEM_PROMPT_IMAGE_MOOD, buildImageMoodUserPrompt } from "../prompts";
import {
  ImageMoodAnalysis,
  IMAGE_MOOD_ANALYSIS_JSON_SCHEMA,
} from "../schemas";
import type { AgentState } from "../state";

// Output via a forced tool call rather than `response_format: json_schema`.
// See emotionAnalyst.ts for the rationale — Groq's response_format decoder
// is flaky on this analyst's nested output, while tool-arg constrained
// decoding is reliable.
const SUBMIT_TOOL_NAME = "submitImageMoodAnalysis";
const SUBMIT_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: SUBMIT_TOOL_NAME,
    description:
      "Submit your image-mood analysis. The args of this call ARE the final answer.",
    parameters: IMAGE_MOOD_ANALYSIS_JSON_SCHEMA,
  },
};

/**
 * Single-shot LLM call: ImageStats + currentParams → structured image-mood
 * analysis JSON. Failure leaves state.imageMood at null; A3 will continue
 * without image-aware guidance.
 */
export async function imageMoodAnalyst(state: AgentState): Promise<void> {
  const groq = getGroq();
  if (!groq) {
    state.trace.push({
      node: "imageMoodAnalyst",
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
        { role: "system", content: SYSTEM_PROMPT_IMAGE_MOOD },
        {
          role: "user",
          content: buildImageMoodUserPrompt(
            state.imageStats,
            state.currentParams,
          ),
        },
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
    if (!tc) throw new Error("image mood analyst returned no tool call");
    const parsed = JSON.parse(tc.function.arguments || "{}");
    const validated = ImageMoodAnalysis.parse(parsed);
    state.imageMood = validated;
    state.trace.push({
      node: "imageMoodAnalyst",
      ok: true,
      summary: validated.summary,
    });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      // Capture failed_generation when Groq's JSON-schema validator
      // rejects — it's the only way to see what the model actually
      // emitted before Groq dropped it on the floor.
      const errBody = (err as { error?: unknown }).error as
        | { failed_generation?: string }
        | undefined;
      console.error(
        "[imageMoodAnalyst] Groq APIError:",
        err.status,
        err.message,
        errBody?.failed_generation
          ? `\nfailed_generation: ${errBody.failed_generation.slice(0, 800)}`
          : "",
      );
    } else {
      console.error("[imageMoodAnalyst] error:", err);
    }
    state.trace.push({
      node: "imageMoodAnalyst",
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
  }
}
