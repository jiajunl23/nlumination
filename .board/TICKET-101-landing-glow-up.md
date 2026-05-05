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

**Done.** Branch `feature/ticket-101-landing-glow-up`, 3 commits.

### What I did

- Added `app/landing.module.css` with three classes of motion (entry,
  ambient, hover) instead of touching `globals.css`. Reduced-motion
  block disables them all.
- Added `components/landing/ModeShowcase.tsx` (server component) that
  renders the three Auto / LLM / Agents cards. Pulls label + hint
  straight from `MODE_COST` in `lib/nlp/modes.ts` so editor copy and
  landing copy stay in sync. Per-mode example prompts are landing-only.
- Added `components/landing/AnimatedPromptTicker.tsx` (client) — small
  3s-interval rotator inside a fake-input pill in the hero so the page
  has continuous motion above the fold.
- Rewrote `app/page.tsx` to wire it all together: staged entry cascade
  via `--d` delay var, drifting gradient on the hero highlight word,
  new accent-gradient primary CTA (`Wand2` icon, `ctaPulse`), animated
  prompt ticker, original feature cards (now with `cardFX` hover), the
  new ModeShowcase section, and a tail CTA.

### Acceptance criteria check

1. New mode-showcase section with icon + label + hint + 3 examples per
   mode — done.
2. Three animation types — entry (`fadeUpAnim`/`blurInAnim`), continuous
   (`gradientDrift`/`ctaPulse`), hover (`cardFX`/`modeCardFX`/
   `primaryCtaFX`) — done.
3. Three button styles present — accent-gradient primary CTA,
   white-pill, ghost-border — done.
4. Mobile (375) responsive — hero CTAs stack on `<sm`, mode grid stacks
   to single column, page padding `px-6 sm:px-8`. Verified via class
   review (didn't run a real browser).
5. `pnpm run typecheck` passes (and ran inside the pre-commit hook for
   each commit).
6. No `app/globals.css` or `app/layout.tsx` changes — verified with
   `git diff main..HEAD --stat`.

### Files touched

- `app/page.tsx` — rewritten
- `app/landing.module.css` — new
- `components/landing/ModeShowcase.tsx` — new
- `components/landing/AnimatedPromptTicker.tsx` — new

### Judgment calls

- **Server vs client split**: kept `page.tsx` and `ModeShowcase` as
  server components; only the prompt ticker is `"use client"`. Entry
  animations are pure CSS keyframes so they don't need a scroll
  observer or hydration.
- **Used CSS-var delays (`--d`) inline** instead of generating dozens
  of `.delay-100ms` utility classes — keeps the module file small and
  lets each call site own its timing.
- **Lucide icons for mode cards**: `Zap` (Auto = fast), `Sparkles`
  (LLM = magic), `Bot` (Agents = multi-agent). Matches the editor's
  visual language.
- **Example prompts are landing-only copy**, not pulled from
  `MODE_COST` — `MODE_COST.hint` is one terse line meant for a
  tooltip; landing visitors need richer examples. If we ever want
  these to live in `lib/`, easy to promote to `MODE_COST.examples`.
- **Tail CTA added** — the page felt unfinished without a closing
  action after the long mode showcase. Reuses the primary gradient
  CTA style minus the pulse so it doesn't fight the hero CTA for
  attention.

### Couldn't verify

- **No live browser pass.** Did not run `pnpm run dev` and look at it
  in a browser at 375 / 1440 widths — typecheck passes and class names
  match Tailwind v4 + the existing palette, but visual review is on
  the orchestrator. Specifically worth eyeballing: the ticker's
  absolute-positioned cycling lines in the hero pill (positioning math
  assumes `h-5` line height), and the accent-glow CTA pulse intensity
  against the `bg-waves` background.
- **No global keyframes were needed** — everything fit in the page
  module, so `app/globals.css` is untouched as required.
- **Lint** has 7 pre-existing errors in `components/editor/*` files I
  didn't touch (TICKET-102 territory). My new files lint clean. The
  pre-commit hook only runs typecheck, so commits went through.
