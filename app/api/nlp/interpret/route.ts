import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { requireDbUser, UnauthorizedError } from "@/lib/auth/current-user";
import { LLMDelta, LLM_JSON_SCHEMA } from "@/lib/nlp/llm-schema";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/nlp/llm-prompt";
import { DAILY_LLM_LIMIT, getRemaining, incrementUsage } from "@/lib/nlp/quota";
import type { GradingParams } from "@/lib/grading/params";
import type { ImageStats } from "@/lib/grading/imageStats";

// Groq is OpenAI-API-compatible. Same SDK, different baseURL.
// Construct lazily — `new OpenAI({ apiKey: undefined })` throws synchronously
// at module-evaluation time, which would crash the whole route file before
// the missing-key check below ever runs.
let groqClient: OpenAI | null | undefined;
function getGroq(): OpenAI | null {
  if (groqClient !== undefined) return groqClient;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    groqClient = null;
    return null;
  }
  groqClient = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
  return groqClient;
}

const Body = z.object({
  prompt: z.string().min(1).max(500),
  current: z.unknown(),
  stats: z.unknown().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const groq = getGroq();
    if (!groq) {
      return NextResponse.json(
        { error: "AI fallback not configured", code: "not_configured" },
        { status: 503 },
      );
    }

    const userId = await requireDbUser();
    const { prompt, current, stats } = Body.parse(await req.json());

    const remaining = await getRemaining(userId);
    if (remaining <= 0) {
      return NextResponse.json(
        {
          error: `Daily AI limit reached (${DAILY_LLM_LIMIT}/day).`,
          code: "quota_exceeded",
          quota: { used: DAILY_LLM_LIMIT, limit: DAILY_LLM_LIMIT },
        },
        { status: 429 },
      );
    }

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      temperature: 0.2,
      // 384 occasionally truncates mid-JSON for richer prompts (model hits
      // the cap before closing the object). 1024 leaves comfortable
      // headroom; the actual valid responses are well under 200 tokens.
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(
            prompt,
            current as GradingParams,
            (stats ?? null) as ImageStats | null,
          ),
        },
      ],
      // strict: true would require every property to appear in `required`
      // arrays per OpenAI's structured-output spec — rebuilding the schema
      // to comply (with nullable types for "optional" fields) doubles the
      // schema size for marginal benefit. strict: false still uses the
      // schema to guide output; Zod re-validates and clamps every field.
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Model returned invalid JSON", code: "bad_json" },
        { status: 502 },
      );
    }

    let delta;
    try {
      delta = LLMDelta.parse(parsed);
    } catch (zerr) {
      console.error("[nlp] LLMDelta.parse failed. Raw model output:", raw);
      throw zerr;
    }
    const newCount = await incrementUsage(userId);

    return NextResponse.json({
      delta,
      quota: { used: newCount, limit: DAILY_LLM_LIMIT },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      console.error("[nlp] ZodError issues:", JSON.stringify(err.issues));
      return NextResponse.json(
        { error: "Bad request", issues: err.issues },
        { status: 400 },
      );
    }
    if (err instanceof OpenAI.APIError) {
      console.error("[nlp] Groq APIError:", err.status, err.message, JSON.stringify(err.error ?? {}));
      // Surface Groq's own 429 / 5xx with a clean shape so the client can
      // fall back to chips without parsing the raw provider error.
      const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
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
