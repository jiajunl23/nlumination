import "server-only";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";
import { getGroq, GROQ_MODEL } from "../groq";
import { SYSTEM_PROMPT_ACTION, buildActionUserPrompt } from "../prompts";
import { TOOLS, dispatchTool, SUBMIT_FINAL_DELTA_TOOL_NAME } from "../tools";
import { LLMDelta } from "@/lib/nlp/llm-schema";
import type { AgentState } from "../state";

const MAX_ITER = 2;

const TOOLS_SPEC: ChatCompletionTool[] = TOOLS.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));

/**
 * Action agent. ReAct-style loop with MAX_ITER=2.
 *
 * Output contract: A3 always answers via a tool call. Two tools:
 *   - applyPreset(name)        → preview a preset's diff (informational)
 *   - submitFinalDelta(...)    → THE answer; args ARE the LLMDelta
 *
 * This avoids Groq's "json mode cannot be combined with tool calling"
 * limitation and gives every A3 output a single, uniform contract.
 *
 * Iteration choice:
 *   - iter 0: tool_choice = "auto" — model picks applyPreset OR submitFinalDelta
 *   - iter 1: tool_choice forces submitFinalDelta — model MUST end with the answer
 *
 * Cost: 1 call (no preset) or 2 calls (preset previewed first). Combined
 * with A1 + A2, agents-mode total is 3 or 4 calls.
 */
export async function actionAgent(state: AgentState): Promise<void> {
  const groq = getGroq();
  if (!groq) {
    state.error = "groq_not_configured";
    return;
  }

  state.actionMessages = [
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
  ];

  while (
    state.actionIter < MAX_ITER &&
    !state.finalDelta &&
    !state.error
  ) {
    const isLastIter = state.actionIter === MAX_ITER - 1;

    const toolChoice: ChatCompletionToolChoiceOption = isLastIter
      ? { type: "function", function: { name: SUBMIT_FINAL_DELTA_TOOL_NAME } }
      : "auto";

    let completion;
    try {
      completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_tokens: 1024,
        messages: state.actionMessages,
        tools: TOOLS_SPEC,
        tool_choice: toolChoice,
      });
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        console.error(
          "[actionAgent] Groq APIError:",
          err.status,
          err.message,
        );
      } else {
        console.error("[actionAgent] error:", err);
      }
      state.error = "actionAgent_call_failed";
      return;
    }
    state.callCount += 1;
    state.actionIter += 1;

    const choice = completion.choices[0];
    const msg = choice?.message;
    if (!msg) {
      state.error = "actionAgent_no_message";
      state.trace.push({
        node: "actionAgent.callLLM",
        iter: state.actionIter,
        toolCalls: null,
        finishReason: choice?.finish_reason ?? "missing",
      });
      return;
    }

    const finishReason = choice.finish_reason ?? "stop";
    const fnToolCalls =
      msg.tool_calls?.filter(
        (tc): tc is Extract<typeof tc, { type: "function" }> =>
          tc.type === "function",
      ) ?? [];
    state.trace.push({
      node: "actionAgent.callLLM",
      iter: state.actionIter,
      toolCalls: fnToolCalls.length
        ? fnToolCalls.map((tc) => tc.function.name)
        : null,
      finishReason,
    });

    if (fnToolCalls.length === 0) {
      // We forced tool_choice — model still gave free text. Bail to fallback.
      state.error = "actionAgent_no_tool_call";
      state.trace.push({
        node: "actionAgent.finalize",
        ok: false,
        error: "model emitted text instead of tool call",
      });
      return;
    }

    // Push the assistant message (with tool_calls) into history.
    // OpenAI protocol: this MUST be immediately followed by matching
    // role:"tool" messages, one per tool_call_id.
    state.actionMessages.push(msg as ChatCompletionMessageParam);

    let finalSubmitted = false;
    for (const tc of fnToolCalls) {
      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(tc.function.arguments || "{}");
      } catch {
        parsedArgs = {};
      }

      if (tc.function.name === SUBMIT_FINAL_DELTA_TOOL_NAME) {
        // The args ARE the final delta. Don't dispatch — validate directly.
        try {
          const delta = LLMDelta.parse(parsedArgs);
          state.finalDelta = delta;
          state.trace.push({
            node: "actionAgent.tool",
            name: tc.function.name,
            args: parsedArgs,
            ok: true,
          });
          state.trace.push({ node: "actionAgent.finalize", ok: true });
          finalSubmitted = true;
          // Still push a tool result so the message history stays valid
          // (the loop won't continue, but defensive nonetheless).
          state.actionMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({ ok: true }),
          });
        } catch (err) {
          state.trace.push({
            node: "actionAgent.tool",
            name: tc.function.name,
            args: parsedArgs,
            ok: false,
            error: err instanceof Error ? err.message.slice(0, 200) : "parse",
          });
          state.actionMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({ error: "delta_parse_failed" }),
          });
          state.error = "actionAgent_bad_final_delta";
        }
      } else {
        // Normal tool — dispatch and feed the result back.
        const result = dispatchTool(tc.function.name, parsedArgs, state);
        const isError =
          result !== null &&
          typeof result === "object" &&
          "error" in (result as object);
        state.trace.push({
          node: "actionAgent.tool",
          name: tc.function.name,
          args: parsedArgs,
          ok: !isError,
          error: isError
            ? ((result as { error?: string }).error ?? "unknown")
            : undefined,
        });
        state.actionMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    if (finalSubmitted) break; // success — exit the while loop
  }

  if (!state.finalDelta && !state.error) {
    state.error = "actionAgent_iteration_cap";
  }
}
