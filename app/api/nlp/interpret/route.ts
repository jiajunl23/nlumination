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
 *
 * BYO key: a user-supplied Groq key may arrive in the `X-Groq-Key`
 * header. When set + valid format, we use it for every Groq call this
 * request makes and SKIP both quota check and quota increment — their
 * key, their tokens. The key is read directly into a per-request
 * client; **never forwarded, logged, or persisted**.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { requireDbUser, UnauthorizedError } from "@/lib/auth/current-user";
import { LLMDelta, type LLMDeltaT } from "@/lib/nlp/llm-schema";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/nlp/llm-prompt";
import { DAILY_LLM_LIMIT, MODE_COST, type ServerMode } from "@/lib/nlp/modes";
import { getRemaining, incrementUsage } from "@/lib/nlp/quota";
import { runAgentsPipeline } from "@/lib/nlp/agent/graph";
import {
  getGroq,
  getGroqForKey,
  GROQ_MODEL,
} from "@/lib/nlp/agent/groq";
import { isValidGroqKey } from "@/lib/nlp/groq-key";
import { isAllowedImageUrl } from "@/lib/nlp/image-url";
import { cloudinaryCloudName } from "@/lib/storage/cloudinary";
import type { GradingParams } from "@/lib/grading/params";
import type { ImageStats } from "@/lib/grading/imageStats";
import type { TraceEntry, TurnRecord } from "@/lib/nlp/agent/state";
import { summariseHistory } from "@/lib/nlp/history-summary";

// Vercel default Route Handler timeout is 10s on the Hobby tier. Agents
// mode runs 3-4 sequential Groq calls (A1 ‖ A2 → A3, ±applyPreset) and
// occasionally bumps against that ceiling under cold starts or slow
// upstream. 60s gives us comfortable headroom; LLM mode finishes in 1s
// either way so the higher cap is harmless.
export const maxDuration = 60;

const HistoryEntry = z.object({
  prompt: z.string().min(1).max(500),
  paramsBefore: z.unknown(),
  delta: z.unknown(),
  paramsAfter: z.unknown(),
  timestamp: z.number(),
});

const Body = z.object({
  prompt: z.string().min(1).max(500),
  current: z.unknown(),
  stats: z.unknown().optional().nullable(),
  mode: z.enum(["llm", "agents"]).default("llm"),
  // Up to 50 turn-records ride along; route trims to a char budget before
  // injecting into prompts so an unbounded session doesn't blow context.
  history: z.array(HistoryEntry).max(50).optional().default([]),
  // Either a Cloudinary CDN URL (saved photo) or a base64 data URL
  // (fresh upload, downsampled to 384px). Cap at 200KB to bound payload
  // size; only the agents pipeline uses this — LLM mode ignores it.
  imageUrl: z.string().max(200_000).optional().nullable(),
  // Grading-mode toggle (agents pipeline only) — controls LUT tool-selection
  // behaviour: lut/slider/auto. Defaults to "auto"
  // so older clients that don't send the field keep working.
  gradeMode: z.enum(["auto", "lut", "slider"]).optional().default("auto"),
});

/**
 * Drop oldest turns until the rendered history fits maxChars. Defence-
 * in-depth: client *also* limits how many it sends, but never trust
 * the client.
 */
function trimHistory(
  history: readonly TurnRecord[],
  maxChars = 6000,
): TurnRecord[] {
  let kept = history.slice();
  while (kept.length > 0 && summariseHistory(kept).length > maxChars) {
    kept = kept.slice(1); // drop oldest
  }
  return kept;
}

interface SingleShotResult {
  delta: LLMDeltaT | null;
  callCount: number;
  error: string | null;
}

async function singleShotFallback(input: {
  prompt: string;
  current: GradingParams;
  stats: ImageStats | null;
  history: readonly TurnRecord[];
  userApiKey: string | null;
}): Promise<SingleShotResult> {
  const groq = input.userApiKey
    ? getGroqForKey(input.userApiKey)
    : getGroq();
  if (!groq) return { delta: null, callCount: 0, error: "groq_not_configured" };

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 512,
      // json_object (not json_schema): the schema would have cost ~262
      // input tokens per call. Zod + mergeDelta clamp post-hoc.
      response_format: { type: "json_object" },
      // gpt-oss-20b emits hidden reasoning tokens that count toward the
      // TPD limit. "low" cuts them from ~500 to ~150 with negligible
      // quality drop on this structured task.
      reasoning_effort: "low",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(
            input.prompt,
            input.current,
            input.stats,
            input.history,
          ),
        },
      ],
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
    const userId = await requireDbUser();

    // BYO key path. Read header *before* the env-key existence check so
    // a user can use the app even when GROQ_API_KEY isn't set in our env.
    const headerKey = req.headers.get("X-Groq-Key");
    let userApiKey: string | null = null;
    if (headerKey !== null && headerKey !== "") {
      if (!isValidGroqKey(headerKey)) {
        return NextResponse.json(
          { error: "Invalid Groq key format", code: "key_format" },
          { status: 400 },
        );
      }
      userApiKey = headerKey;
    }

    // Need at least one viable key (env-shared OR user-supplied). Fail
    // fast otherwise so we don't run through quota accounting only to
    // discover no client can be built.
    if (!userApiKey && !getGroq()) {
      return NextResponse.json(
        { error: "AI not configured", code: "not_configured" },
        { status: 503 },
      );
    }

    const { prompt, current, stats, mode, history, imageUrl, gradeMode } =
      Body.parse(await req.json());

    // SSRF / abuse defence: only allow our Cloudinary CDN or base64 data
    // URLs. Anything else (arbitrary http, internal IP, file://) is
    // silently dropped — A2 degrades to the numeric stats path. We do
    // NOT 400 the request so legacy clients that send a stale URL still
    // get a usable response.
    const safeImageUrl =
      imageUrl && isAllowedImageUrl(imageUrl, cloudinaryCloudName)
        ? imageUrl
        : null;

    // Trim before any LLM call so prompt-side cost stays bounded.
    const trimmedHistory = trimHistory(history as TurnRecord[]);

    // Quota only applies to the shared env key. BYO users burn their
    // own Groq tokens, so we don't gate or count.
    const remaining = userApiKey
      ? Number.POSITIVE_INFINITY
      : await getRemaining(userId);

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
        history: trimmedHistory,
        userApiKey,
        imageUrl: safeImageUrl,
        gradeMode,
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
            history: trimmedHistory,
            userApiKey,
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
        history: trimmedHistory,
        userApiKey,
      });
      callCount += fb.callCount;
      if (fb.delta) delta = fb.delta;
      else pipelineError = fb.error ?? "llm_failed";
    }

    if (callCount > 0) {
      // BYO requests don't burn shared quota. Send a sentinel `unlimited`
      // so the client can swap the badge UI.
      const quota = userApiKey
        ? { unlimited: true as const }
        : {
            used: await incrementUsage(userId, callCount),
            limit: DAILY_LLM_LIMIT,
          };
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
    // Defensive: don't dump the raw err object — its inspector output may
    // include the original request context if an upstream library attached
    // it. Just the name + first 200 chars of message.
    const errName = err instanceof Error ? err.name : typeof err;
    const errMsg =
      err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
    console.error("/api/nlp/interpret", errName, errMsg);
    return NextResponse.json(
      { error: "Interpreter unavailable", code: "internal_error" },
      { status: 503 },
    );
  }
}
