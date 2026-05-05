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

**Done** — branch `feature/ticket-103-gallery-rebuild` (3 commits, not pushed).

### What shipped

1. **Layout direction chosen**: featured-first hero + CSS multi-column
   masonry below it. Most recent photo (the page already orders by
   `desc(createdAt)`) gets a full-width hero card with a gradient
   border and shimmering "Latest" badge; remaining photos pack into a
   masonry that respects per-photo aspect ratios.
2. **Background atmosphere**: new `.atmosphere` layer in
   `gallery.module.css` adds (a) a top accent-orange radial gradient
   header band, (b) a drifting magenta halo that slowly orbits, and
   (c) a faint grid pattern with a radial mask. Sits above the shared
   `.bg-waves` (untouched) but below content. Respects
   `prefers-reduced-motion`.
3. **Header**: kept the wordmark / Editor link / UserButton structure
   — just wrapped in a translucent backdrop-blurred surface so it
   floats over the atmosphere, and switched the page title to the
   accent→magenta gradient text used elsewhere in the app.
4. **Photo cards**: hover lifts the card 2px, adds an accent-glow
   shadow + ring, and reveals a gradient scrim with the filename +
   dimensions + "Click to refine" hint. On touch devices (`@media
   (hover: none)`) the meta scrim and delete button stay visible.
   Delete is now a 32×32 (36×36 on touch) glassy round button instead
   of a 14px icon.
5. **Empty state**: replaced the dashed box with a glowing conic
   orb-in-frame illustration, friendlier copy, and a CTA pair (Open
   editor + a sample-prompt hint pill).
6. **WebGL pipeline integration unchanged** — same `setImage` /
   `setParams` / `fitCanvas` / `render` call order, same
   `dispose()` on unmount.
7. **Click-through + delete contract preserved** — `Link` href is
   still `/editor?photoId=${id}`, `onDelete` still does optimistic
   removal with rollback.

### Verification

- `pnpm run typecheck` — passes (also runs in the pre-commit hook;
  all 3 commits passed it).
- `pnpm run build` — full prod build succeeds; 10/10 static pages
  generated; no CSS-module resolution errors.
- Visual: I did **not** mock photos in `initial`; auth-guarded route
  + no DB in this worktree env. The empty state was visually composed
  via the JSX path; populated states verified by reading the layout
  rules. Worth a manual pass on the orchestrator's account before
  merge to confirm the masonry packing on the actual photo set.
- Mobile (375): masonry collapses to 1 column, hero spans full width,
  delete button is 36px and visible by default.
- Tablet (768): 2 columns. Desktop (≥1024): 3 columns. Wide
  (≥1440): 4 columns.

### Files touched

- `app/gallery/page.tsx` — header + title + atmosphere wrapper +
  photo-count chip + max-w-7xl container.
- `components/gallery/GalleryGrid.tsx` — featured-first split, CSS
  multi-column masonry, illustrated empty state.
- `components/gallery/PhotoCard.tsx` — full visual rebuild around the
  same canvas + Pipeline integration.
- `components/gallery/gallery.module.css` — new file: atmosphere
  layers, masonry rules, card hover/featured styles, hover scrim,
  delete button, empty-state orb.

### No-touch list honoured

- `app/globals.css` — untouched.
- `app/layout.tsx` — untouched.
- `lib/webgl/pipeline.ts` — untouched.
- `app/page.tsx`, `app/editor/**`, `components/editor/**` — untouched.

### Blockers / open questions

- None. One judgment call to flag: I went with featured-first **and**
  hover-reveal **and** masonry simultaneously rather than picking one;
  the ticket said "pick what fits best" but they're all complementary
  and the result reads as one cohesive design rather than three
  competing ones. Easy to scope back to just masonry by removing the
  `featured` block in `GalleryGrid` if reviewers prefer.
