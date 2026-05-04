import "server-only";
import OpenAI from "openai";
import { getGroq, GROQ_MODEL } from "../groq";
import { SYSTEM_PROMPT_IMAGE_MOOD, buildImageMoodUserPrompt } from "../prompts";
import {
  ImageMoodAnalysis,
  IMAGE_MOOD_ANALYSIS_JSON_SCHEMA,
} from "../schemas";
import type { AgentState } from "../state";

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
      max_tokens: 1024,
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
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "image_mood_analysis",
          strict: false,
          schema: IMAGE_MOOD_ANALYSIS_JSON_SCHEMA,
        },
      },
    });
    state.callCount += 1;

    const raw = completion.choices[0]?.message.content ?? "{}";
    const parsed = JSON.parse(raw);
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
