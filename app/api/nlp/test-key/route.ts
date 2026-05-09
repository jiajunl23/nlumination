/**
 * Validate a user-supplied Groq key without burning their daily budget.
 *
 * Flow: client posts a key in the `X-Groq-Key` header → server runs a
 * 1-token completion against the cheapest model → returns 200/401/502.
 *
 * Security:
 * - The key is read straight into a per-request client and **never logged
 *   or persisted** (server-side or DB-side).
 * - We don't accept the key in the JSON body; header-only keeps it out
 *   of any access logs that capture POST bodies.
 * - Format is checked before construction so a typo doesn't even reach
 *   Groq.
 *
 * This endpoint is intentionally **separate** from /api/nlp/interpret
 * so that "test connection" can have a tighter timeout and a smaller
 * surface area to reason about.
 */
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireDbUser, UnauthorizedError } from "@/lib/auth/current-user";
import { getGroqForKey, GROQ_MODEL } from "@/lib/nlp/agent/groq";
import { isValidGroqKey } from "@/lib/nlp/groq-key";

export const maxDuration = 15;

export async function POST(req: Request) {
  try {
    await requireDbUser();

    const apiKey = req.headers.get("X-Groq-Key") ?? "";
    if (!isValidGroqKey(apiKey)) {
      return NextResponse.json(
        { error: "Invalid key format", code: "format" },
        { status: 400 },
      );
    }

    const groq = getGroqForKey(apiKey);
    try {
      // Smallest possible call. We only care that the key authenticates;
      // the response content is discarded.
      await groq.chat.completions.create({
        model: GROQ_MODEL,
        max_tokens: 1,
        reasoning_effort: "low",
        messages: [{ role: "user", content: "ok" }],
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        // 401 from Groq → user gave us a wrong key. Anything else (5xx,
        // rate limit, network) we report as upstream issue so user
        // doesn't think their key is bad when it's just Groq being slow.
        const userFacing =
          err.status === 401 ? 401 : err.status === 429 ? 429 : 502;
        // NOTE: deliberately NOT logging the key or the full request — only
        // err.status + err.message (Groq's own short reason).
        console.error("[test-key] Groq APIError:", err.status, err.message);
        return NextResponse.json(
          {
            error:
              err.status === 401
                ? "Key rejected by Groq"
                : err.status === 429
                  ? "Rate limited (this is your key's quota, not ours)"
                  : "Groq unavailable — try again",
            code:
              err.status === 401
                ? "auth"
                : err.status === 429
                  ? "rate_limited"
                  : "upstream",
          },
          { status: userFacing },
        );
      }
      console.error("[test-key] error:", err);
      return NextResponse.json(
        { error: "Network error", code: "network" },
        { status: 502 },
      );
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("/api/nlp/test-key", err);
    return NextResponse.json(
      { error: "Internal error", code: "internal" },
      { status: 500 },
    );
  }
}
