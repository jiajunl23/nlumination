import "server-only";
import OpenAI from "openai";
import { getGroq, GROQ_MODEL } from "../groq";
import {
  SYSTEM_PROMPT_IMAGE_MOOD,
  buildImageMoodUserPrompt,
} from "../prompts";
import type { AgentState } from "../state";

/**
 * A2 — image mood analyst. Reads pre-computed ImageStats and emits ONE
 * sentence describing the photo's current character + headroom. Plain
 * chat completion, no tool call.
 *
 * Failure → state.imageMood stays null; A3 still has the raw user prompt
 * and can either guess or stay conservative.
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
      // See emotionAnalyst.ts — must accommodate hidden reasoning + visible.
      max_tokens: 320,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: SYSTEM_PROMPT_IMAGE_MOOD },
        {
          role: "user",
          content: buildImageMoodUserPrompt(state.imageStats),
        },
      ],
    });
    state.callCount += 1;

    const text = completion.choices[0]?.message.content?.trim() ?? "";
    if (!text) throw new Error("empty image-mood response");
    state.imageMood = text;
    state.trace.push({
      node: "imageMoodAnalyst",
      ok: true,
      summary: text.slice(0, 160),
    });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      console.error(
        "[imageMoodAnalyst] Groq APIError:",
        err.status,
        err.message,
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
