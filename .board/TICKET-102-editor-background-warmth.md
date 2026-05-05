# TICKET-102 — Editor background warmth (no layout change)

**Branch**: `feature/ticket-102-editor-bg-warmth`
**Owner**: parallel-agent B
**Status**: pending

## What you're building

The editor (`/editor`) layout has been tuned over many sessions and is
intentionally NOT in scope to change. What IS in scope: the user feels
the editor "almost all black, ugly". The shared `.bg-waves` ambient
blobs from `app/layout.tsx` should be visible, but the editor's
opaque panes cover most of the viewport, killing the atmosphere.

Goal: keep the layout pixel-for-pixel identical, but make the editor
**feel less flat-black** through better surface treatment — translucent
panels, subtle gradients, gentle accents on dividers. Aim for:
"editor still looks professional, but you can sense the colored
ambient glow behind the panels". Current vibe: 0% atmosphere. Target:
~30% atmosphere — present but not distracting.

## Scope (files you MAY touch)

- `components/editor/EditorRoot.tsx` — only the **container/background
  classNames** of the outer panes. DO NOT change the grid layout, the
  flex structure, the sticky behavior, the conditional rendering, or
  any imperative logic. You're allowed to change `className=` strings
  and add wrapper divs ONLY if they're purely cosmetic.
- `components/editor/Canvas.tsx` — only the outer canvas wrapper /
  background, not WebGL pipeline code.
- `components/editor/SliderPanel.tsx` — section header treatments,
  divider colors, panel surface tint. NOT the slider rows themselves.
- `components/editor/ChatPanel.tsx` — only the outer container surface,
  NOT the message rendering, NOT the toggle group, NOT the trace lines.
- `app/editor/page.tsx` — small wrapper, OK to tweak background.
- New file: `components/editor/editor.module.css` — for editor-specific
  keyframes / gradients if you need them. Use this instead of `globals.css`.

## Files you MUST NOT touch

- `app/globals.css` — shared.
- `app/layout.tsx` — `.bg-waves` is shared.
- `components/editor/HSLPanel.tsx`, `ToneCurveEditor.tsx`,
  `SplitToningPanel.tsx`, `MyPresets.tsx`, `Slider.tsx`, `Section.tsx`,
  `BeforeAfterToggle.tsx`, `DropZone.tsx` — these are interactive
  controls; out of scope for this ticket.
- Any `lib/**` file.
- `app/page.tsx`, `app/gallery/**`, `components/gallery/**` — other agents own.

## Concrete techniques you can use

- **Translucent panels**: change `bg-[var(--color-bg-elev-1)]` to
  `bg-[color-mix(in_oklab,var(--color-bg-elev-1)_70%,transparent)]`
  + add `backdrop-blur-md` so the underlying `.bg-waves` shows through.
- **Subtle gradient tint** on the canvas pane background:
  `bg-gradient-to-br from-[var(--color-bg)] to-[var(--color-bg-elev-1)]`.
- **Inner glow on focused panels**: `ring-1 ring-[var(--color-border)]/40`
  + `shadow-[inset_0_1px_0_var(--color-border)]`.
- **Accent tinge on dividers**: instead of `border-[var(--color-border)]`,
  use `border-[color-mix(in_oklab,var(--color-accent)_8%,var(--color-border))]`.
- **Gentle spotlight on save/export footer**: a `radial-gradient` overlay
  pinned to the corner.

Don't go overboard — restraint is the virtue. If a tweak makes the
panel look like it's competing with the photo for attention, dial it back.

## Acceptance criteria

1. Pixel layout is unchanged — every panel is the same size, same
   position, same scroll behavior, same interactions as before.
2. The editor no longer feels "flat black" — at least the panels have
   some translucency or gradient so the `.bg-waves` ambient is felt.
3. No regression in the WebGL canvas rendering — the canvas itself
   stays a clean black `<canvas>` (don't make the photo's background
   patterned, that ruins the editing context).
4. `pnpm run typecheck` passes.
5. No `app/globals.css` or `app/layout.tsx` changes.
6. Mobile (375px) and desktop (1440px) both still work.

## How to verify

Start dev server (`pnpm run dev`), open `http://localhost:3000/editor`,
load the sample image, and:
- Verify all panels still in the same positions.
- Verify you can sense the orange/magenta ambient glow without it
  fighting the photo for attention.
- Open the Adjustments collapsible — slider section still works.
- Open the agents-mode chat — chat panel still works.
- Resize the window — sticky canvas + side panel behavior unchanged.

## Branch + commit rules

- Branch: `feature/ticket-102-editor-bg-warmth`.
- Pre-commit hook runs `pnpm run typecheck`.
- Don't push. Don't open a PR. Make 2-3 focused commits.

## Status

Done — branch `feature/ticket-102-editor-bg-warmth`.

### Approach

Added `components/editor/editor.module.css` with five small reusable
classes — `.panel` / `.panelSolid` (translucent surfaces with
`backdrop-filter: blur(14px) saturate(140%)`), `.canvasFrame` (subtle
135° gradient for the DropZone-state frame surround), `.tintedBorder`
helpers, and `.footerSpotlight` (a 120% radial accent at top-right of
the Save/Export footer). All values use `color-mix(in oklab, …)` so
they respect existing theme tokens.

### Where the warmth lives

- **`app/editor/page.tsx`** — header now uses
  `bg-[color-mix(...)_72%]` + `backdrop-blur-md` + 6%-accent-tinted
  bottom border. The `.bg-waves` orange blob now reads through the
  top bar.
- **`components/editor/EditorRoot.tsx`** —
  - Right-column ChatPanel, Adjustments collapsible, and Save/Export
    footer are all translucent (`.panel` / `.panelSolid`) so the
    magenta+orange ambient bleeds through.
  - Footer gets `.footerSpotlight` for a faint corner glow.
  - Canvas frame surround uses `.canvasFrame` *only when no image is
    loaded* (DropZone state). Once `frame` is set the frame stays a
    solid bg-elev-1 so the photo's border is clean.
  - All panel borders carry a 7-8% accent tinge.
- **`components/editor/ChatPanel.tsx`** — outer container surface +
  internal divider tints. No message-rendering / toggle / trace edits.

### Restraint calls

- **SliderPanel.tsx** was in scope but I left it untouched: every
  `Section` it contains is in the do-not-touch list, and the slider
  area sits inside the Adjustments collapsible whose surface is
  already tinted from EditorRoot. Tweaking SliderPanel further would
  have only added noise to dense controls.
- **Canvas.tsx** intentionally untouched — the WebGL `<canvas>` must
  stay a clean black field (acceptance criterion #3).
- Translucency caps at ~70-86% (not 50%) — anywhere lower starts
  fighting the photo for attention when the image dominates the view.

### Verification

- `pnpm run typecheck` passes (pre-commit hook ran on each commit).
- Verified at desktop 1440×900 and mobile 375×812 with playwright —
  layout pixel-identical to before, `.bg-waves` clearly perceptible
  through right-column panels (magenta blob bottom-right, orange top
  bar), photo dominates when loaded, no interaction regressions.

### Commits

1. `a7f1afc` — translucent ChatPanel + editor header surfaces (adds
   `editor.module.css`).
2. `e60b08e` — translucent Adjustments + Save panels, gradient drop
   frame.
3. `<status-commit>` — this Status update.

### Blockers

None.
