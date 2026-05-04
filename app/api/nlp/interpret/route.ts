/**
 * NL → grading delta endpoint. Two server-visible modes (the third,
 * `auto`, is a client-side strategy and never reaches the server):
 *
 *   - "llm"    : single-shot Groq call, ~1 LLM call
 *   - "agents" : multi-agent pipeline (A1 ‖ A2 → A3), 3–4 LLM calls
 *
 * Quota is charged by ACTUAL call count (state.callCount for agents,
 * 1 for llm) — not by user request. A user with 100/day budget gets
 * ~25 agents-mode prompts or ~100 llm-mode prompts, mixed freely.
 *
 * Auto-downgrade: if `mode: agents` is requested but the user has
 * fewer than agents.estimated calls left, we transparently downgrade
 * to llm and return `downgraded: true` so the UI can flag it.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { requireDbUser, UnauthorizedError } from "@/lib/auth/current-user";
import { LLMDelta, LLM_JSON_SCHEMA, type LLMDeltaT } from "@/lib/nlp/llm-schema";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/nlp/llm-prompt";
import { DAILY_LLM_LIMIT, MODE_COST, type ServerMode } from "@/lib/nlp/modes";
import { getRemaining, incrementUsage } from "@/lib/nlp/quota";
import { runAgentsPipeline } from "@/lib/nlp/agent/graph";
import { getGroq, GROQ_MODEL } from "@/lib/nlp/agent/groq";
import type { GradingParams } from "@/lib/grading/params";
import type { ImageStats } from "@/lib/grading/imageStats";
import type { TraceEntry } from "@/lib/nlp/agent/state";

// Vercel default Route Handler timeout is 10s on the Hobby tier. Agents
// mode runs 3-4 sequential Groq calls (A1 ‖ A2 → A3, ±applyPreset) and
// occasionally bumps against that ceiling under cold starts or slow
// upstream. 60s gives us comfortable headroom; LLM mode finishes in 1s
// either way so the higher cap is harmless.
export const maxDuration = 60;

const Body = z.object({
  prompt: z.string().min(1).max(500),
  current: z.unknown(),
  stats: z.unknown().optional().nullable(),
  mode: z.enum(["llm", "agents"]).default("llm"),
});

interface SingleShotResult {
  delta: LLMDeltaT | null;
  callCount: number;
  error: string | null;
}

async function singleShotFallback(input: {
  prompt: string;
  current: GradingParams;
  stats: ImageStats | null;
}): Promise<SingleShotResult> {
  const groq = getGroq();
  if (!groq) return { delta: null, callCount: 0, error: "groq_not_configured" };

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(input.prompt, input.current, input.stats),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "grading_delta",
          strict: false,
          schema: LLM_JSON_SCHEMA,
        },
      },
    });
    const raw = completion.choices[0]?.message.content ?? "{}";
    const parsed = JSON.parse(raw);
    const delta = LLMDelta.parse(parsed);
    return { delta, callCount: 1, error: null };
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      console.error("[singleShot] Groq APIError:", err.status, err.message);
    } else {
      console.error("[singleShot] error:", err);
    }
    // No callCount — Groq either rejected before generating or threw.
    return { delta: null, callCount: 0, error: "single_shot_failed" };
  }
}

export async function POST(req: Request) {
  try {
    if (!getGroq()) {
      return NextResponse.json(
        { error: "AI not configured", code: "not_configured" },
        { status: 503 },
      );
    }

    const userId = await requireDbUser();
    const { prompt, current, stats, mode } = Body.parse(await req.json());

    const remaining = await getRemaining(userId);

    let actualMode: ServerMode = mode;
    let downgraded = false;

    if (mode === "agents" && remaining < MODE_COST.agents.estimated) {
      if (remaining >= MODE_COST.llm.estimated) {
        actualMode = "llm";
        downgraded = true;
      } else {
        return NextResponse.json(
          {
            error: `Daily limit reached (${DAILY_LLM_LIMIT}/day).`,
            code: "quota_exceeded",
            quota: { used: DAILY_LLM_LIMIT, limit: DAILY_LLM_LIMIT },
          },
          { status: 429 },
        );
      }
    } else if (mode === "llm" && remaining < MODE_COST.llm.estimated) {
      return NextResponse.json(
        {
          error: `Daily limit reached (${DAILY_LLM_LIMIT}/day).`,
          code: "quota_exceeded",
          quota: { used: DAILY_LLM_LIMIT, limit: DAILY_LLM_LIMIT },
        },
        { status: 429 },
      );
    }

    let delta: LLMDeltaT | null = null;
    let callCount = 0;
    let trace: TraceEntry[] | undefined;
    let pipelineError: string | null = null;

    if (actualMode === "agents") {
      const state = await runAgentsPipeline({
        userPrompt: prompt,
        currentParams: current as GradingParams,
        imageStats: (stats ?? null) as ImageStats | null,
      });
      trace = state.trace;
      callCount += state.callCount;
      if (state.finalDelta) {
        delta = state.finalDelta;
      } else {
        pipelineError = state.error ?? "agents_no_delta";
        // Try single-shot fallback if budget still allows.
        if (remaining - callCount >= MODE_COST.llm.estimated) {
          state.trace.push({ node: "fallback", reason: pipelineError });
          const fb = await singleShotFallback({
            prompt,
            current: current as GradingParams,
            stats: (stats ?? null) as ImageStats | null,
          });
          callCount += fb.callCount;
          if (fb.delta) {
            delta = fb.delta;
            pipelineError = null;
          }
        }
      }
    } else {
      const fb = await singleShotFallback({
        prompt,
        current: current as GradingParams,
        stats: (stats ?? null) as ImageStats | null,
      });
      callCount += fb.callCount;
      if (fb.delta) delta = fb.delta;
      else pipelineError = fb.error ?? "llm_failed";
    }

    if (callCount > 0) {
      const newCount = await incrementUsage(userId, callCount);
      const quota = { used: newCount, limit: DAILY_LLM_LIMIT };
      if (delta) {
        return NextResponse.json({ delta, quota, trace, downgraded });
      }
      return NextResponse.json(
        {
          error: "Interpreter failed",
          code: pipelineError ?? "no_delta",
          quota,
          trace,
          downgraded,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        error: "Interpreter unavailable",
        code: pipelineError ?? "internal",
        trace,
      },
      { status: 503 },
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      console.error("[nlp] ZodError:", JSON.stringify(err.issues));
      return NextResponse.json(
        { error: "Bad request", issues: err.issues },
        { status: 400 },
      );
    }
    if (err instanceof OpenAI.APIError) {
      console.error(
        "[nlp] Groq APIError:",
        err.status,
        err.message,
        JSON.stringify(err.error ?? {}),
      );
      const status =
        err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
      return NextResponse.json(
        { error: "Interpreter unavailable", code: "upstream_error" },
        { status },
      );
    }
    console.error("/api/nlp/interpret", err);
    return NextResponse.json(
      { error: "Interpreter unavailable", code: "internal_error" },
      { status: 503 },
    );
  }
}
