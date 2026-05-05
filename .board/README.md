# Task Board

Coordination folder for parallel-agent work. Each `TICKET-NNN-*.md` is a
self-contained work item that an agent can pick up in its own git
worktree without our chat context.

## Ground rules for agents picking up a ticket

1. **Read the ticket file fully before touching code.** It states scope,
   files in play, acceptance criteria.
2. **Read `AGENTS.md` and `CLAUDE.md` at repo root** — Next.js 16 has
   breaking changes; consult `node_modules/next/dist/docs/` before
   writing route/middleware/config code.
3. **Stay in your ticket's scope.** Don't refactor sibling files even
   if they look messy. Cross-cutting cleanup happens in its own ticket.
4. **`pnpm run typecheck` must pass before each commit.** The
   pre-commit hook will block you otherwise.
5. **Branch name**: `feature/<ticket-id>-<short-slug>`.
6. **Don't push.** The orchestrator (parent agent) will review your
   branch and decide whether to push + open a PR.
7. **Update your ticket file** at the end with a "Status" section
   describing what you did, what you didn't, and any open questions.

## Active tickets

| ID  | Title | Status |
| --- | ----- | ------ |
| —   | (none yet — add `TICKET-NNN-<slug>.md` files here when assigning work) | — |
