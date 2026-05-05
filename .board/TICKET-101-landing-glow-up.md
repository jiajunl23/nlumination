# TICKET-101 — Landing page glow-up

**Branch**: `feature/ticket-101-landing-glow-up`
**Owner**: parallel-agent A
**Status**: pending

## What you're building

The landing page (`/`) at `app/page.tsx` works but is conservative — one
hero block, three feature cards, that's it. The user wants:

1. **More animation** — entry animations, scroll-triggered reveals,
   subtle motion on hover, animated text/numbers where it makes sense.
2. **More button variety** — the page has two button styles right now
   (white pill + ghost border). Add a third "primary CTA" with the
   accent gradient (already used for the wordmark and the "feel."
   highlight) — for the most important action.
3. **Surface our LLM capability** — the page barely mentions that we
   have a hosted LLM behind natural-language prompts. Add a section
   that shows the **three modes (Auto / LLM / Agents)** with one-liner
   value props, and example prompts that demonstrate each. Pull
   inspiration from `lib/nlp/modes.ts` (`MODE_COST.{auto,llm,agents}.hint`)
   so the copy stays in sync with what the editor actually does.
4. **Keep the existing visual style** — same color palette
   (`--color-accent` orange → `--color-magenta` pink → `--color-cyan`),
   Geist font, dark theme, the `.bg-waves` ambient blobs (already
   provided by `app/layout.tsx`), rounded-2xl / rounded-full controls,
   lucide icons.

## Scope (files you MAY touch)

- `app/page.tsx` (rewrite freely within the page).
- New file: `app/landing.module.css` — for keyframes / page-specific
  animations. Use this instead of putting keyframes in `globals.css`.
- New components under `components/landing/*.tsx` if you want to break
  out sections (e.g. `ModeShowcase.tsx`, `AnimatedHero.tsx`). Keep
  them client components ("use client") only when they need it.

## Files you MUST NOT touch

- `app/globals.css` — shared with editor + gallery. If you genuinely
  need a global keyframe, document it in your Status section and stop.
- `app/layout.tsx` — `.bg-waves` is shared.
- `components/editor/*`, `components/gallery/*` — owned by other agents.
- `lib/**` — no logic changes.

## Acceptance criteria

1. Landing page has at least **one new fully-fleshed section** beyond
   what's there today — recommended: a "Three ways to talk to your
   photos" mode showcase (Auto / LLM / Agents) with each card showing
   icon + label + 1-line hint + 2-3 example prompts.
2. At least **3 distinct types of animation** on the page:
   - Entry animation (fade-in / slide-up on first paint)
   - Hover micro-interactions on cards/buttons (scale, glow, shift)
   - Continuous ambient motion on at least one element (e.g. animated
     gradient text, pulse on the accent CTA)
3. **Three button styles** present: white-pill (existing), ghost-border
   (existing), and a new accent-gradient primary CTA at least somewhere
   prominent (the hero CTA is the obvious place).
4. Page works at mobile (375px) and desktop (1440px) widths.
5. `pnpm run typecheck` passes.
6. No `app/globals.css` or `app/layout.tsx` changes.

## How to verify

Start dev server (`pnpm run dev`), open `http://localhost:3000`.
- Refresh — should see entry animation play.
- Hover the CTAs and feature cards — micro-interactions should be felt.
- Scroll through the new mode showcase section.
- Check it on a narrow viewport (browser devtools → 375px).

## Style references in the codebase

- `app/page.tsx` itself — current style and gradient text usage.
- `components/editor/MyPresets.tsx` — small inline pill controls.
- `app/globals.css` — the `.bg-waves`, `.glass`, `.ring-accent-glow`
  utilities are already available; use them.

## Branch + commit rules

- Branch: `feature/ticket-101-landing-glow-up` (create with
  `git checkout -b feature/ticket-101-landing-glow-up` before first commit).
- Pre-commit hook runs `pnpm run typecheck` — fix any type errors first.
- Don't push. Don't open a PR. The orchestrator reviews.
- Make ~2-4 focused commits, not one mega-commit.

## Status

(Fill in after work is done: what you did, what you skipped and why,
files touched, any judgment calls.)
