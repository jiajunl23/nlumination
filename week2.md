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

---

# Week 2 (continued) — Multi-agent upgrade

After the single-shot LLM landed, three pain points showed up in real use:

1. **Same prompt, different image, same numbers.** The single-shot prompt sees only `meanLuminance/stdLuminance/dominant cast` summarised as `dark, low-contrast, warm-cast`. "Make it warmer" returns the same `+25 temp` whether the photo is already amber or genuinely cold. The LLM has no chance to *read* the image at the precision the prompt deserves.
2. **Compound emotional language.** "Moody but not too dark", "vintage with golden hour feel" — these have internal tensions or layered references. Single-shot has to reason about feeling AND read the image AND decide values in one breath. The 20B model isn't reliable at all three.
3. **Groq budget visibility.** The original 50/day cap was opaque — no way for the user to spend it differently between cheap prompts and expensive ones.

The fix is a multi-agent pipeline (LangGraph mental model, **zero new dependencies** — same `openai` SDK, same Groq endpoint, just orchestrated differently) plus a 3-mode toggle so the user explicitly chooses cost-vs-quality per prompt.

## Three modes, one shared budget

| Mode      | Path                                                           | Cost (LLM calls) |
| --------- | -------------------------------------------------------------- | ---------------- |
| `auto`    | Local parser first. LLM fallback only when parser misses       | 0 or 1           |
| `llm`     | Single-shot Groq → JSON delta (the original week-2 design)     | 1                |
| `agents`  | Emotion analyst ‖ Image-mood analyst → Action agent            | 3 or 4           |

Daily limit went from 50 → **100 calls/day**, billed by **actual call count** (not user requests). One user can do 100 cheap LLM prompts, ~25-33 agents prompts, or any mix. `auto` mode hits the parser on common phrasings ("warmer", "more contrast", "moody, blue shadows") and consumes 0 budget.

When `agents` is requested but budget < 4, the route **automatically downgrades to `llm`** and the response carries `downgraded: true`; the chat shows a one-line note "Budget low — used LLM mode instead of Agents". No silent surprises.

## Three-agent pipeline (the meat)

```
       User prompt   +   ImageStats   +   currentParams
            │                │                 │
            ├────────────────┤                 │
            ▼                ▼                 │
   ┌──────────────┐  ┌──────────────┐          │
   │  Agent 1:    │  │  Agent 2:    │   parallel
   │  Emotion     │  │  Image Mood  │   (Promise.all)
   │  Analyst     │  │  Analyst     │          │
   └──────┬───────┘  └──────┬───────┘          │
          │                 │                  │
          └────────┬────────┘                  │
                   ▼                           ▼
           ┌───────────────────────────────────────┐
           │  Agent 3: Action Agent                │
           │  (tools: applyPreset, submitFinalDelta) │
           └───────────────────┬───────────────────┘
                               ▼
                          LLMDelta
```

**Agent 1 — Emotion Analyst**: digests the user's prompt into a structured-but-free-form emotion vector. Detects qualities like "melancholy +moderate", "warmth +subtle"; resolves photographic terms (`chiaroscuro`, `golden hour`) and self-explains them; flags internal tensions ("wants moody but explicitly says 'not too dark'").

**Agent 2 — Image Mood Analyst**: digests the actual `ImageStats` numbers (`meanLuminance=0.32`, `p05=0.05`, `meanR > meanB`, etc.) into a brief about the image's *current* personality and where it has *headroom* for modification — "shadows can be lifted up to +30 without crushing", "more warmth is risky (already warm-cast)". Agent 3 reads the brief, not the raw numbers.

**Agent 3 — Action Agent**: gets both briefs + the raw user prompt as a fall-back truth source, and outputs the final `LLMDelta`. Has access to two tools: `applyPreset(name)` to peek at any of the 8 preset diffs as a starting point, and `submitFinalDelta(...)` whose args ARE the final answer (more on this below).

Each agent has its **own** SYSTEM_PROMPT and JSON Schema, ~250-450 tokens each. Three small, focused prompts beat one 1200-token mega-prompt at consistency for a 20B model.

### LangGraph mental model → our code

| LangGraph concept              | Our equivalent                                       | File                                     |
| ------------------------------ | ---------------------------------------------------- | ---------------------------------------- |
| `StateGraph` (multi-agent)     | `runAgentsPipeline(input)`                           | `lib/nlp/agent/graph.ts`                 |
| Shared TypedDict state         | `AgentState` interface                               | `lib/nlp/agent/state.ts`                 |
| Analyst node                   | one `(state) => Promise<void>` function each         | `lib/nlp/agent/nodes/{emotion,imageMood}Analyst.ts` |
| Parallel branches              | `await Promise.all([nodeA(s), nodeB(s)])`            | `graph.ts`                               |
| Tool                           | `{name, description, parameters, execute}` object    | `lib/nlp/agent/tools.ts`                 |
| ToolNode + ReAct loop          | inline while-loop in `actionAgent.ts`                | `lib/nlp/agent/nodes/actionAgent.ts`     |
| `END`                          | `state.finalDelta != null` exits the loop            | `actionAgent.ts`                         |

We deliberately did NOT import `@langchain/langgraph` (~600KB + 20 transitive deps). Hand-writing the orchestrator in ~30 lines of TypeScript proved easier to read, debug, and trace.

## Three Groq landmines (worth writing down)

While building the action agent, three Groq quirks surprised us:

### 1. `tools` and `response_format: json_schema` are mutually exclusive

```
[actionAgent] Groq APIError: 400 json mode cannot be combined with tool/function calling
```

OpenAI's API allows them together; Groq doesn't. So the action agent can't say "here are the tools, AND please format your final non-tool answer per this schema". You have to pick one.

**The fix that worked**: ditch `response_format` entirely. Make the final delta itself a tool — `submitFinalDelta`, with `LLM_JSON_SCHEMA` as its `parameters`. The model's "answer" is a tool call whose **arguments are the LLMDelta**. We intercept that tool name and treat its args as the final output (Zod-validated) instead of dispatching it. ReAct loop becomes:

- iter 0: `tool_choice: "auto"` — model picks `applyPreset` (preview) OR `submitFinalDelta` (done)
- iter 1: `tool_choice: { type: "function", function: { name: "submitFinalDelta" } }` — model is **forced** to deliver the answer

Cost: 1 call (no preset) or 2 calls (preset previewed → final). Together with A1+A2, agents-mode runs 3 or 4 calls per prompt.

### 2. `strict: false` still validates schema strictly

```
[imageMoodAnalyst] Groq APIError: 400 Failed to validate JSON
[imageMoodAnalyst] Groq APIError: 400 jsonschema: '' does not validate with /required: missing properties: 'modification_guidance', 'summary'
```

Groq's `strict: false` is documented as "guides but doesn't enforce" — in practice it still rejects responses that miss `required` fields. The 20B model occasionally omits `summary` or `modification_guidance`.

**The fix that worked**: drop `required` arrays AND `minLength` from the JSON Schema mirror entirely (the JSON Schema only *guides* now), keep all fields required at the **Zod** layer with `.optional().default("")` so missing fields parse cleanly. We get strong typing on the consumer side without rigid Groq-side gatekeeping.

### 3. `gpt-oss-20b` reasoning tokens count toward billing

`completion.usage.completion_tokens_details.reasoning_tokens: 29` — gpt-oss is OpenAI's o1-style reasoning family. Hidden chain-of-thought tokens count toward the visible `completion_tokens`. Roughly 20-100 tok per call. Over 4 agents-mode calls that's 80-400 tok overhead beyond what the JSON output suggests. Still well under Groq's 8K TPM ceiling.

## Free-form schemas (the analyst output design)

Both analysts emit JSON, but the JSON deliberately uses **`string` fields where a fixed enum would be tempting**:

```ts
// EmotionAnalysis
detected_qualities: Array<{
  name: string,                                   // ← free-form, NOT enum
  direction: "+" | "-",                           // ← enum (genuinely binary)
  intensity: "subtle" | "moderate" | "strong",    // ← enum (canonical 3-step)
  rationale: string,
}>

// ImageMoodAnalysis
notable_observations: Array<{
  aspect: string,                                 // ← free-form
  finding: string,
  implication: string,
}>
```

The split is "use enum where the taxonomy is genuinely small and stable; use string everywhere else". A `primary_mood` enum of 7 options would silently squash "calm but slightly melancholic" into one bucket. Free-form `mood_description: string` lets the analyst express that nuance, and downstream Agent 3 (also a language model) reads it just fine.

Length caps (`.max(280)` on free-text fields, `.max(8)` on arrays) keep tokens bounded without prescribing content shape.

## Failure tolerance — three layers of fallback

```
agents pipeline                         single-shot
─────────────────                       ───────────
A1 fail → state.emotionAnalysis = null  →
A2 fail → state.imageMood = null        → Agent 3 runs anyway, infers from raw user prompt
A3 fail → state.error set              ↘
                                         singleShotFallback() (the original LLM mode logic)
                                       ↘
                                         If even single-shot fails, the parser's chips UI
                                         takes over on the client. Editor never breaks.
```

Every analyst failure logs to `state.trace` with the reason; the user sees it as `🖼️ Image analyst failed (...)` in the chat. Every level charges only for calls that actually hit Groq — failed analysts cost 0.

This was tested live: the very first agents request hit Groq's `tools+response_format` combo error (before the `submitFinalDelta` refactor) — A3 failed, route auto-fell back to single-shot, and the user got a usable delta after a 6.6 s round-trip. The error never reached the UI.

## ChatPanel — 3-way toggle with cost transparency

```
┌─────────────────────────────────────┐
│ ✦ Prompt          [Auto] [LLM] [Agents] │
│ Emotion + Image analysts → Action (3-4 calls)    Calls used today: 5/100 │
│ ...                                 │
└─────────────────────────────────────┘
```

The hint line under the toggle changes per mode (from `MODE_COST[mode].hint` — single source of truth shared with the server). When budget < `agents.estimated`, the Agents button is disabled with tooltip "Not enough budget — try LLM (1 call) or Auto". When the server downgrades a request, the assistant message appends "Budget low — used LLM mode instead of Agents."

Old localStorage values (`"ai"`) are migrated to `"llm"` by `normalizeStoredMode()` so existing users don't lose their preference.

## Trace UI

Each agents-mode response carries a `trace: TraceEntry[]` from the server. The chat renders one line per breadcrumb in the assistant message:

```
🖼️ Read image
🧠 Analyzed emotion
🔧 Tool submitFinalDelta ok
✨ Composed delta
```

This is the multi-agent equivalent of "AI thinking..." — the user sees what each agent is doing without needing streaming. With three Groq calls in ~3-5 s total wall time, this is plenty.

## Numbers

Per-mode latency (sample run on the airport sample image, GROQ free tier):

| Mode    | Wall time | Calls | Notes                                                |
| ------- | --------- | ----- | ---------------------------------------------------- |
| `auto`  | <50 ms    | 0     | "warmer" → parser hit, no network                    |
| `llm`   | ~1.0 s    | 1     | "subtle warm glow, slightly faded" → LLMDelta        |
| `agents`| ~5.3 s    | 3     | "vintage with golden hour feel" → A1+A2 ‖, then A3   |
| `agents`| ~3.3 s    | 2     | A2 failed (Groq schema reject) → A3 still produced delta from A1 alone — 2 charged calls |

Token usage per agents prompt: roughly 800-1500 input + 400-700 output total across the three calls. Within the 8K TPM / 200K TPD free-tier limits.

## Files added / changed

```
lib/nlp/modes.ts                            (new) Mode/MODE_COST/normalizeStoredMode
lib/nlp/quota.ts                            (changed) incrementUsage(by) + DAILY_LLM_LIMIT 100
lib/nlp/agent/groq.ts                       (new) shared lazy-init Groq client + GROQ_MODEL
lib/nlp/agent/state.ts                      (new) AgentState + initialState + TraceEntry union
lib/nlp/agent/schemas.ts                    (new) Zod schemas + JSON Schema mirrors for A1, A2
lib/nlp/agent/prompts.ts                    (new) 3 SYSTEM_PROMPTs + buildXxxUserPrompt builders
lib/nlp/agent/tools.ts                      (new) applyPreset + submitFinalDelta + dispatchTool
lib/nlp/agent/nodes/emotionAnalyst.ts       (new) single-shot A1 node
lib/nlp/agent/nodes/imageMoodAnalyst.ts     (new) single-shot A2 node
lib/nlp/agent/nodes/actionAgent.ts          (new) ReAct loop A3 (MAX_ITER=2)
lib/nlp/agent/graph.ts                      (new) runAgentsPipeline = Promise.all([A1,A2]) → A3
app/api/nlp/interpret/route.ts              (rewritten) mode dispatch + auto-downgrade + per-call billing
components/editor/ChatPanel.tsx             (rewritten) 3-way toggle, budget UI, trace lines, downgrade banner
```

`lib/nlp/llm-prompt.ts`, `lib/nlp/llm-schema.ts`, and `lib/nlp/parser.ts` were left untouched — single-shot mode and the parser still own their lanes.

## Why this is a milestone

- **Cost is honest.** "Multi-agent" used to mean "several times more expensive" without the user knowing. Here, each LLM call is counted, displayed live, and the toggle hints make trade-offs visible.
- **Quality has a real story.** "Vintage with golden hour feel" produced 10 simultaneous adjustments (EV, contrast, highlights, shadows, whites, temp, tint, vibrance, saturation, clarity) that single-shot mode would never coordinate that tightly.
- **Failure modes are covered.** Three independent Groq errors hit during E2E testing; all three were absorbed by fallback layers without breaking the editor.
- **Zero new dependencies.** No `langchain`, no `langgraph`, no `ai`. The orchestration is ~30 lines of TypeScript — cheap to read, cheap to maintain, easy to evolve.

## What's next (still planned)

- **Streaming the action agent's tokens** so the trace lines feel even faster.
- **Image-aware preset retrieval.** Right now A3 sees a static catalog of preset descriptions. Embedding-based retrieval (best preset for *this image*'s state) would reduce A3's guesswork.
- **A1/A2 also as ReAct.** They're single-shot today; giving them tools (e.g. A2 could query specific stat percentiles on demand) would unlock more nuanced briefs at the cost of more tokens.
- **Per-tenant key support.** Same as before — still pending.
