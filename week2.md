# Week 2 — NLumination

> Week 1 ended with a deterministic NL parser that handles ~90% of prompts in <1 ms. Week 2 covers the long tail: prompts the keyword parser can't match ("give it a chilly nordic feeling", "like a polaroid from the 80s") now route to a small hosted LLM that returns a JSON params delta, gated behind a per-user daily cap and a manual mode switch.

The constraint going in was "without affecting normal usage but offers more flexibility." Everything in this week's design defers to that — the parser still runs first by default, signed-out users see no change, and every LLM failure mode falls back to either the parser result or the existing chips.

---

## What shipped

### 1. Groq-hosted LLM fallback
We went through three provider designs before landing here:
- **Claude Haiku 4.5** — first plan, scrapped because the user wanted no API-key cost.
- **On-device WebGPU via `@mlc-ai/web-llm`** — second plan, fully drafted (Qwen2.5-0.5B / Llama-3.2-1B), then scrapped because Groq's free tier offers a much better quality/UX trade-off (no 400 MB download, no WebGPU gating, no per-device install).
- **Groq** — final pick. Free tier, no card required, OpenAI-compatible API.

Model in use: **`openai/gpt-oss-20b`** — OpenAI's open-weights 20-billion-parameter model hosted on Groq. ~1000 tok/s throughput. Chosen over `llama-3.1-8b-instant` because gpt-oss-20b is the only Groq production model that supports `response_format: { type: "json_schema" }` with constrained-decoding semantics, and its larger param count handles nuanced prompts better.

Free-tier limits: 30 RPM, 1 K RPD, 8 K TPM, 200 K TPD across all our users. Per-user daily cap of 50 (enforced server-side) keeps any single account from monopolising the global budget — at 50 calls/day max per user, ~20 active daily users fit before the global RPD bites, and that's well past where we'd upgrade.

### 2. Server route — `app/api/nlp/interpret`
A single POST handler that mirrors the existing `/api/photos` and `/api/uploads/sign` route conventions:

- `requireDbUser()` first — anonymous requests get 401 (and never reach this route anyway, because Clerk middleware now matches `/api/nlp(.*)`).
- Quota pre-check: read `llm_usage(userId, today)`. If ≥ 50, return `429 quota_exceeded`.
- Call Groq via `new OpenAI({ baseURL: "https://api.groq.com/openai/v1" })` — same SDK, different endpoint.
- `LLMDelta.parse(parsed)` — defence-in-depth Zod re-validation that clamps every numeric field to its slider range, so a hallucinated "exposure: -8" becomes a sensible "-3" rather than an error.
- Atomic increment of `llm_usage` only on success — failed Groq calls don't burn the user's daily budget.
- Returns `{ delta, quota: { used, limit } }`. The client shows the counter inline.

### 3. Auto / AI mode toggle
A small segmented control in the chat header (signed-in users only):

| Mode | What happens |
|---|---|
| **Auto** (default) | Parser runs first. If `understood.length > 0`, apply parser result and skip the LLM entirely. If empty, call the LLM. |
| **AI** | LLM runs first. If it returns a useful delta, apply it. If Groq 429s or errors, fall back to the parser result. |

State persists per device in `localStorage["nlumination.aiMode"]`. After a refresh the toggle reads back and the placeholder text adjusts accordingly. Hidden entirely for signed-out users — the LLM endpoint requires auth so the toggle would be useless.

### 4. The schema — `lib/nlp/llm-schema.ts`
Two parallel definitions of the same contract:

- **Zod schema** — for runtime re-validation on the server. Every field is optional with `min`/`max` bounds matching the slider UI. `mergeDelta(current, delta)` applies the LLM's output onto a cloned `GradingParams`, clamping every value to its range.
- **JSON Schema literal** — sent to Groq as `response_format.json_schema.schema`. Hand-mirrored from the Zod schema (no `zod-to-json-schema` dep). The two are kept in sync by hand because the schema is small enough (17 top-level fields) and the dependency wasn't worth pulling in.

Allowed-fields subset: `temperature`, `tint`, `exposure`, `contrast`, `highlights`, `shadows`, `whites`, `blacks`, `vibrance`, `saturation`, `clarity`, `vignetteAmount`, plus per-band HSL `{ hue, saturation, luminance }` for all 8 hue bands and the full `splitToning` block. Curve and LUT deliberately excluded — the model can't usefully draw a 4-point spline.

The system prompt is ~400 tokens with five worked examples ("warmer and contrasty", "moody film look", "bluer sky", "give it a chilly nordic feeling", "like a polaroid from the 80s") so the model sees both the schema and a sample of the magnitudes we want.

### 5. Quota — `llm_usage` table
A new Drizzle table:

```ts
llmUsage = pgTable("llm_usage", {
  userId: text(...).references(users.id, { onDelete: "cascade" }),
  day: date(...).notNull(),         // 'YYYY-MM-DD' UTC
  count: integer(...).default(0).notNull(),
}, t => [primaryKey({ columns: [t.userId, t.day] })]);
```

`lib/nlp/quota.ts` exposes `getRemaining(userId)` and `incrementUsage(userId)`. The increment is a single-statement `INSERT … ON CONFLICT DO UPDATE SET count = count + 1`, atomic in Postgres so two concurrent requests can't double-count.

There's a benign +1 race: two concurrent calls at remaining=1 both pass the pre-check and both succeed. Acceptable — true atomicity would need a serialisable transaction and the cap is soft anyway.

### 6. ChatPanel branch logic
The existing parser-only `submit()` was extracted into helpers (`parserAppliedMsg`, `chipsMsg`, `aiAppliedMsg`, `thinkingMsg`) and the function rewritten as an async branch tree. The deterministic parser still runs first in every mode — it's free, sub-millisecond, and serves as the fallback for AI failures. The LLM call only fires on the paths that need it.

The chat now distinguishes AI-applied messages with:
- A **🪄 AI badge** (small orange pill with the wand icon) on the same line as the `applied: …` summary.
- An italic **reasoning line** below — the model's ≤160-char description of what it tried to do ("cool desaturated nordic palette", "warm cinematic tone with subtle contrast, mild saturation boost").
- A subtle **`AI used today: N/50`** counter so users can see the quota draining.
- A spinner **"AI thinking…"** during the round-trip (typically ~600–800 ms p50 for gpt-oss-20b).

When Groq 429s or errors out, the chat shows a friendly prefix ("Daily AI limit reached (50/day). Falling back to keywords." or "AI unavailable — falling back to keywords.") then renders whatever the parser came up with, or chips if the parser also returned nothing.

### 7. Auth gating
- `proxy.ts` matcher gained `/api/nlp(.*)` so the route is Clerk-protected at the edge, not just inside the handler. Anonymous requests return 401 fast without spinning up the route handler.
- The `Auto/AI` toggle is conditionally rendered on `isSignedIn`, so signed-out users don't even see it.
- Signed-out users still get the full deterministic parser path — exactly the same behavior as week 1.

---

## Bugs we hit and fixed (during Playwright verification)

Three of these surfaced only after the feature was wired end-to-end and the first real prompt hit Groq.

1. **Groq client crashed at module-load time when the key was missing.** `new OpenAI({ apiKey: undefined })` throws synchronously, which means my "if no key, return 503" guard at the top of the route handler never ran — the whole module evaluation aborted and Next.js returned a generic 500. Fixed by wrapping construction in a `getGroq()` lazy-init helper so the missing-key path now produces the clean 503 we expected.

2. **`strict: true` JSON Schema rejected by Groq.** OpenAI's structured-output spec requires every property to appear in a `required` array on its enclosing object — even fields we treat as optional. My initial schema only listed top-level keys and Groq returned `400 invalid JSON schema for response_format: 'grading_delta': /properties/splitToning/required: 'required' is required to be supplied …`. Two ways to fix: rebuild the schema to fully comply (every key required, types like `["number", "null"]` to allow omission), or drop `strict: true` and rely on Zod for validation. I picked the second — the JSON Schema still guides the model's output, and Zod re-validates and clamps every field anyway.

3. **`max_tokens: 384` truncated mid-JSON.** With the full GradingParams payload + ImageStats in the user prompt, the model sometimes started a longer JSON and ran out of tokens before closing it — Groq returned `json_validate_failed: max completion tokens reached before generating a valid document`. Bumped to 1024; valid responses are well under 200 tokens so the new ceiling is far beyond what's actually used.

4. **`.env*` is gitignored, so `.env.local.example` updates can't be committed.** Discovered when staging — my Groq key documentation in `.env.local.example` was silently being ignored. Mentioned for future fix; the user can carve out `.env*.example` from the gitignore rule when convenient.

---

## Verification

End-to-end via Playwright MCP, signed in to a Clerk dev account, sample image loaded:

1. **Auto + "cinematic"** → parser handles it instantly. `applied: +18 contrast, -25 highlights, +18 shadows, …, cinematic teal-orange`. Network log confirms zero `/api/nlp/interpret` calls. ✓
2. **Auto + "give it a chilly nordic feeling"** → parser empty → LLM fallback → 🪄 AI badge with `applied: -10 highlights, -30 temp, -15 saturation, -10 clarity`, reasoning *"cool desaturated nordic palette"*, counter `1/50 → 2/50`. ~800 ms round-trip including the visible thinking indicator. ✓
3. **AI mode + "cinematic"** → LLM interpreted directly (warmer + more saturated than the parser preset: `+50 temp, +25 saturation, …`, reasoning *"warm cinematic tone with subtle contrast, mild saturation boost, …"*), counter `→ 3/50`. ✓
4. **Mode persistence** → page refresh keeps AI mode. `localStorage["nlumination.aiMode"]` reads `"ai"`. Placeholder text changes to the AI-style example. ✓

Failure modes also exercised:
- Missing `GROQ_API_KEY` → route returns clean 503, UI silently falls back to chips.
- Groq strict-mode 400 (during fix #2) → caught by `OpenAI.APIError` branch, returns 400 with `code: "upstream_error"`, UI falls back to chips.
- Groq 429 (simulated locally by setting `DAILY_LLM_LIMIT = 2` and firing 3 prompts) → returns 429 with `code: "quota_exceeded"`, UI shows "Daily AI limit reached (50/day). Falling back to keywords." then either applies the parser result or shows chips.

---

## Numbers

| Surface | Count |
|---|---|
| New files | 5 (`route.ts`, `llm-schema.ts`, `llm-prompt.ts`, `quota.ts`, drizzle migration `0001_*`) |
| Modified files | 4 (`ChatPanel.tsx`, `schema.ts`, `proxy.ts`, `package.json`) |
| Database tables added | 1 (`llm_usage`) |
| LLM provider | Groq (free tier) |
| Model | `openai/gpt-oss-20b` |
| Parameter count | 20 B |
| Throughput | ~1000 tok/s |
| Per-user daily cap | 50 calls / UTC day |
| Free-tier global cap | 1 K RPD / 8 K TPM |
| Allowed schema fields | 17 top-level + 8 HSL bands × 3 + 5 split-tone |
| System prompt size | ~400 tokens |
| Typical response size | <200 tokens |
| Round-trip latency | ~600–800 ms p50 |
| Trigger modes | 2 (Auto / AI), persisted per device |
| New deps | 1 (`openai`) |
| Auth path | Clerk middleware + `requireDbUser()` |
| Failure-mode fallbacks | 3 (parser result → chips → silent message) |

---

## Where it stands at end of week 2

- The deterministic parser still owns the common case. Default behaviour is unchanged for everyone — the LLM call only happens when the parser returns nothing or the user explicitly flips the toggle.
- Signed-in users get a meaningful interpretation for arbitrary natural-language prompts ("give it a chilly nordic feeling", "like a polaroid from 1985"), with a small daily cap that prevents accidental abuse and a clear visual signal (🪄 AI) so they know which path produced their edit.
- The full chain — parser, LLM, schema validation, clamping, quota — fails gracefully at every step. Groq down? Falls back to the parser. Quota hit? Falls back to chips. Bad JSON from the model? Falls back to chips. Editor never breaks.
- Cost is $0 — running entirely on Groq's free tier. If usage scales past free limits, dropping in a card flips us to the Developer plan at ~$0.075/M input + $0.30/M output with no code changes.
- The codebase is on `main` at commit `3ad52c0` and auto-deployed to Vercel. `GROQ_API_KEY` is set in both `.env.local` and `.env.production` (and needs to be added in the Vercel dashboard for prod).

## What's next (planned but not built)

- **Streaming responses.** gpt-oss-20b supports `stream: true`. Showing tokens as they arrive would make the AI mode feel ~2× faster perceptually.
- **Multi-version gallery.** The schema already supports many edits per photo (the `edits` table is 1:N) — needs UI for save-as-new vs update-current and version listing.
- **Curve UI.** Same as week 1's "what's next" — still pending.
- **Live quota indicator** in the toggle area (not just per-message), so users can see how many AI calls they have left before they spend one.
- **Per-tenant key support.** Right now everyone shares the global Groq key. If we wanted users to bring their own keys for unlimited calls, the route already has the seam — just needs a `users.groqKey` column and a precedence check.
