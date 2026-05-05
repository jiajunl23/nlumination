# TICKET-103 — Gallery layout + background rebuild

**Branch**: `feature/ticket-103-gallery-rebuild`
**Owner**: parallel-agent C
**Status**: pending

## What you're building

The gallery page (`/gallery`) is functional but plain — a 4-col grid of
thumbnails on a dark background. The user wants a substantial visual
upgrade in two directions:

1. **Better grid layout** — go beyond a uniform 4-col. Options worth
   trying (pick what fits best):
   - Masonry with varied aspect ratios respected (some tall portrait
     cards, some wide landscape cards).
   - Featured-card-first layout (the most recent photo gets a
     larger hero card).
   - Subtle hover states with metadata reveal (filename, date,
     dimensions, last edit's reasoning text if available).
2. **Better background atmosphere** — the gallery currently sits on
   plain `var(--color-bg)`. The shared `.bg-waves` from layout helps a
   little but not enough on a long-scroll grid page. Add page-specific
   atmosphere: a soft top gradient header, possibly a static or
   parallax ambient pattern behind the grid, or both. Match the same
   palette as the rest of the app.

Keep the **header** (NLumination wordmark + Editor link + UserButton)
and the page **information architecture** (title + subtitle + grid).
Refine, don't rebuild.

## Scope (files you MAY touch)

- `app/gallery/page.tsx` — the page wrapper. OK to redesign the
  header/title/subtitle treatment.
- `components/gallery/GalleryGrid.tsx` — change layout (CSS grid,
  masonry via columns, custom flex). Keep the `onDelete`,
  `useState`, and Photo type contract.
- `components/gallery/PhotoCard.tsx` — full design freedom on the card,
  but keep:
  - The `<canvas>` element + WebGL `Pipeline` integration unchanged.
  - The `<Link href={`/editor?photoId=${id}`}>` click target.
  - The `onDelete` wiring.
- New file: `components/gallery/gallery.module.css` — for gallery
  specific keyframes / gradients if you need them.

## Files you MUST NOT touch

- `app/globals.css` — shared.
- `app/layout.tsx` — `.bg-waves` is shared.
- `lib/webgl/pipeline.ts` — the WebGL render pipeline. Out of scope.
- `app/page.tsx`, `app/editor/**`, `components/editor/**` — other agents.

## Acceptance criteria

1. Grid layout is **visually richer** than the current uniform 4-col —
   either masonry, featured-first, or hover-detail-reveal. The change
   should be obviously different at first glance, not a tweak.
2. Background is no longer plain — the page has at least one ambient
   element (gradient, soft pattern, top-shadow header band, etc.)
   beyond what `.bg-waves` provides.
3. **Empty state** is upgraded too — currently a dashed-border box with
   "No saved edits yet". Make it more inviting (illustration placeholder
   OK; no need for actual SVG art if you keep it tasteful).
4. **Photo cards** have improved hover treatment showing at least the
   filename clearly (or revealing it on hover) — currently it's a
   tiny gradient overlay at the bottom. Aim for "Pinterest / Apple
   Photos" levels of polish.
5. Click-through to `/editor?photoId={id}` still works.
6. Delete-on-hover still works (mobile-friendly tap target preserved
   or improved).
7. Mobile (375px wide) shows a sensible 1-2 col layout. Tablet (768px)
   is 2-3 col. Desktop (1440px) is 3-4 col or masonry.
8. `pnpm run typecheck` passes.
9. No `app/globals.css` or `app/layout.tsx` changes.

## How to verify

You'll need a few test photos in the gallery to see the layout work.
Either:
- Sign in to your Clerk dev account (the orchestrator already has
  some test photos saved), OR
- Mock the `initial` prop in `GalleryGrid.tsx` temporarily for visual
  testing (REVERT before commit), OR
- Just trust the layout in pure CSS terms with empty + 1 + 5 + 12 photo
  states (use the empty state path, then visually compose).

`pnpm run dev`, open `http://localhost:3000/gallery`. Test
empty state by going to a fresh account or temporarily clearing the DB
filter (don't actually delete data).

## Style references

- `app/page.tsx` — landing page gradient text, hero treatment.
- `components/editor/MyPresets.tsx` — how cards/pills are styled.
- `app/globals.css` — `.glass`, `.ring-accent-glow`, `.scrollbar-thin`
  utilities are already available; reuse where they fit.

## Branch + commit rules

- Branch: `feature/ticket-103-gallery-rebuild`.
- Pre-commit hook runs `pnpm run typecheck`.
- Don't push. Don't open a PR. Make 2-4 focused commits.

## Status

(Fill in after work is done.)
