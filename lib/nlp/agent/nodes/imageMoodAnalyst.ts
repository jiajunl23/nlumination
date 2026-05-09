import "server-only";
import OpenAI from "openai";
import { getGroqForState, GROQ_MODEL, GROQ_VLM_MODEL } from "../groq";
import {
  SYSTEM_PROMPT_IMAGE_MOOD,
  SYSTEM_PROMPT_IMAGE_VLM,
  buildImageMoodUserPrompt,
  buildImageMoodVlmContent,
} from "../prompts";
import type { AgentState } from "../state";

/**
 * A2 — image mood analyst. Two paths:
 *
 *   • VLM (preferred when state.imageUrl is set) — Llama-4-Scout reads
 *     the actual photo via OpenAI-compatible image_url content. Gives
 *     the analyst real visual context (subject, lighting, mood) instead
 *     of inferring from 7 numeric stats.
 *
 *   • numeric (fallback) — original ImageStats path. Used when no
 *     image URL is provided OR the VLM call returns a 4xx (model id
 *     change, content rejection, etc.) so a Groq-side regression in
 *     the preview model id doesn't take A2 offline entirely.
 *
 * Output shape is the same in both paths: a single sentence written to
 * `state.imageMood`, consumed verbatim by A3.
 */
export async function imageMoodAnalyst(state: AgentState): Promise<void> {
  const groq = getGroqForState(state);
  if (!groq) {
    state.trace.push({
      node: "imageMoodAnalyst",
      ok: false,
      path: "stats",
      error: "groq_not_configured",
    });
    return;
  }

  // Try VLM first if we have a URL. On 4xx (model retired, image rejected,
  // payload too large), fall through to numeric.
  if (state.imageUrl) {
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_VLM_MODEL,
        temperature: 0.2,
        // Llama-4-Scout is a larger model; visible output stays tiny but
        // image-token overhead means we want headroom for any reasoning.
        max_tokens: 320,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_IMAGE_VLM },
          {
            role: "user",
            content: buildImageMoodVlmContent(state.imageUrl, state.imageStats),
          },
        ],
      });
      state.callCount += 1;

      const text = completion.choices[0]?.message.content?.trim() ?? "";
      if (!text) throw new Error("empty vlm response");
      state.imageMood = text;
      state.trace.push({
        node: "imageMoodAnalyst",
        ok: true,
        path: "vlm",
        summary: text.slice(0, 160),
      });
      return;
    } catch (err) {
      const status = err instanceof OpenAI.APIError ? err.status : undefined;
      // 4xx → fall through to numeric. 5xx / network → also fall through;
      // worst case the numeric path also fails and A3 still runs without
      // an image brief.
      if (err instanceof OpenAI.APIError) {
        console.error(
          "[imageMoodAnalyst:vlm] Groq APIError:",
          err.status,
          err.message,
        );
      } else {
        console.error("[imageMoodAnalyst:vlm] error:", err);
      }
      state.trace.push({
        node: "imageMoodAnalyst",
        ok: false,
        path: "vlm",
        error:
          (status ? `${status}: ` : "") +
          (err instanceof Error ? err.message.slice(0, 200) : "unknown"),
      });
      // Continue into numeric path below.
    }
  }

  // Numeric fallback (or no image URL given).
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
      path: "stats",
      summary: text.slice(0, 160),
    });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      console.error(
        "[imageMoodAnalyst:stats] Groq APIError:",
        err.status,
        err.message,
      );
    } else {
      console.error("[imageMoodAnalyst:stats] error:", err);
    }
    state.trace.push({
      node: "imageMoodAnalyst",
      ok: false,
      path: "stats",
      error: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
  }
}
