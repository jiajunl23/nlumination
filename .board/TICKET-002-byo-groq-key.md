# TICKET-002 — Bring-your-own Groq API key

**Branch**: `feature/ticket-002-byo-groq-key`
**Owner**: parallel-agent B
**Status**: pending

## Context

Right now every signed-in user shares one global `GROQ_API_KEY` from
`.env.local`, capped at 100 calls/day per user (`DAILY_LLM_LIMIT` in
`lib/nlp/modes.ts`). Power users will hit that cap fast. The seam is
already there — `lib/nlp/agent/groq.ts` reads `process.env.GROQ_API_KEY`
in a `getGroq()` helper. We just need a per-user override.

## Scope

You own:

- **DB schema**: `lib/db/schema.ts` — add a `groqApiKey: text` column
  on the `users` table (nullable).
- **DB migration**: run `pnpm run db:generate` to create a new
  `drizzle/000N_*.sql` file. **DO NOT** apply with `db:push` — leave
  that for the orchestrator to do after review.
- **API**: new `app/api/settings/groq-key/route.ts` with:
  - `GET` → returns `{ hasKey: boolean }` (never echo back the key
    itself, even masked — just whether one is stored).
  - `PUT` body `{ key: string }` → stores; basic validation
    (must start with `gsk_`, length > 20).
  - `DELETE` → clears the column.
  - All three behind `requireDbUser()` like every other route.
  - Add `/api/settings(.*)` to `proxy.ts` matchers.
- **Server seam**: `lib/nlp/agent/groq.ts` — instead of one cached
  client, expose a function `getGroqForUser(userId): Promise<OpenAI | null>`
  that:
  - Looks up the user's stored key in DB; if present, returns a NEW
    OpenAI client constructed with that key.
  - Otherwise falls back to the env-key client (still cached).
  - Don't cache per-user clients; the lookup is one indexed SQL
    query and constructing OpenAI() is cheap.
- **Quota bypass**: when a user has their own key, skip the
  `getRemaining()` check in `app/api/nlp/interpret/route.ts` and skip
  `incrementUsage()` (their tokens, their problem). Make the route
  receive a flag from `getGroqForUser` indicating which path we're on.
- **Settings UI**: new client component, simplest possible, accessible
  from the user's Clerk avatar dropdown OR a new `/settings` page —
  pick whichever is one fewer file. Show:
  - Whether a custom key is stored.
  - Input + Save button to set/replace.
  - Delete button to clear.
  - One-line explainer: "Use your own Groq key for unlimited prompts.
    Free tier at console.groq.com."

## You do NOT touch

- ChatPanel.tsx (the LLM-call code path consumes the seam, no UI change needed).
- Any other agent node, parser, schema, etc.
- Don't refactor `quota.ts`.

## Acceptance criteria

1. Without a stored key: behaviour is identical to today (env key, 100/day cap).
2. With a stored key: agents+LLM modes work, `Calls used today: N/100`
   counter does NOT increment (or shows "unlimited" — pick one and
   document the choice in your Status section).
3. Storing an invalid key (wrong prefix, < 20 chars) returns 400 from PUT.
4. Deleting reverts to the env key path.
5. `pnpm run typecheck` passes. The new migration SQL file is committed.

## Definition of done

- All four acceptance criteria above demonstrated locally (you can use
  curl against the dev server, no need to wire up the full UI for the
  test — just verify the route).
- Branch `feature/ticket-002-byo-groq-key` with all changes committed.
- Status section filled in below.

## Out of scope

- Encryption-at-rest for the stored key. (Neon Postgres is encrypted
  at rest by default, and dev keys aren't sensitive enough to warrant
  application-layer encryption right now. Note this in Status.)
- Per-user model choice or model overrides.
- Audit logging.

## Status

(Fill in after work is done.)
