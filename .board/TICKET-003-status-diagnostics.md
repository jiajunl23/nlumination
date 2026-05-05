# TICKET-003 — `/api/health` + `/status` diagnostics page

**Branch**: `feature/ticket-003-status-diagnostics`
**Owner**: parallel-agent C
**Status**: pending

## Context

NLumination has no operational visibility today. When a user reports
"agents mode not working", the only signal is reading server logs. A
small `/api/health` endpoint that probes each external dependency, plus
a `/status` page that renders it nicely, makes triage trivial.

## Scope

This ticket only creates **new files**. You don't modify any existing
file (except possibly `proxy.ts` to mark `/api/health` and `/status` as
public/unprotected — see below).

You own:

- **`app/api/health/route.ts`** — a `GET` handler that returns:
  ```json
  {
    "status": "ok" | "degraded",
    "checks": {
      "db": { "ok": boolean, "latencyMs": number, "error"?: string },
      "groq": { "ok": boolean, "latencyMs": number, "error"?: string },
      "cloudinary": { "ok": boolean, "latencyMs": number, "error"?: string }
    },
    "timestamp": string
  }
  ```
  - **db**: a trivial `SELECT 1` against Drizzle (`lib/db/client.ts`).
  - **groq**: a single `groq.models.list()` (lightweight, no token cost).
    If `GROQ_API_KEY` is missing, return `{ ok: false, error: "no_api_key" }`.
  - **cloudinary**: a single `cloudinary.api.ping()` (lightweight, free).
  - `status: "ok"` only if all three pass; `"degraded"` if any fails.
  - Return HTTP 200 either way (the body carries the truth — monitoring
    tools can parse it).
  - Make it **public** (no `requireDbUser`). It's intended for uptime monitoring.
- **`app/status/page.tsx`** — server component that fetches its own
  `/api/health` once and renders a small dashboard:
  - Three status cards (DB / Groq / Cloudinary) with green/red indicators
    + latency ms.
  - "Last checked: <time>" line.
  - A subtle "Refresh" button that re-fetches.
  - Match the existing app's dark theme (use the same CSS vars
    `--color-bg`, `--color-fg`, `--color-border` etc. — grep any
    existing component for the conventions).
  - Public — anyone can see it. No Clerk gating.
- **`proxy.ts`**: if needed, exclude `/api/health` and `/status` from
  the Clerk-protected routes (they should stay anonymous-accessible).
  Read the current `proxy.ts` carefully — likely the matcher already
  excludes things that aren't explicitly matched.

## You do NOT touch

- Any existing file other than `proxy.ts` (and only the matcher list,
  if necessary).
- Database schema (read-only access via existing client).
- Agents pipeline, NL routes, editor components.

## Acceptance criteria

1. `curl http://localhost:3000/api/health | jq` shows three checks with
   booleans and latency in ms.
2. `/status` page loads and renders the same data visually.
3. Anonymous requests work — no 401.
4. If you kill DB/Groq env vars, the corresponding check shows `ok: false`
   with an `error` string and the page renders red for that card.
5. `pnpm run typecheck` passes.

## Useful pointers

- `lib/db/client.ts` exports the Drizzle `db` instance; `import { sql } from "drizzle-orm"` and `await db.execute(sql\`SELECT 1\`)`.
- `lib/storage/url.ts` and `app/api/uploads/sign/route.ts` show how
  `cloudinary` is configured. `import { v2 as cloudinary } from "cloudinary"`.
- `lib/nlp/agent/groq.ts` exports `getGroq()` returning `OpenAI | null`.
  Use `groq.models.list()` to probe.
- Keep the page simple — no client-side state, no fancy charts. A
  server component + small refresh form is enough.

## Definition of done

- All five acceptance criteria pass locally.
- Branch `feature/ticket-003-status-diagnostics` with all changes committed.
- Status section filled in below.

## Out of scope

- Auth-protected admin section.
- Historical metrics / time-series.
- Alerting integrations.
- WebSocket auto-refresh — manual refresh is fine.

## Status

(Fill in after work is done.)
