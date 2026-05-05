# TICKET-001 — Tone curve UI polish

**Branch**: `feature/ticket-001-curve-polish`
**Owner**: parallel-agent A
**Status**: pending

## Context

NLumination has a working tone-curve editor at
`components/editor/ToneCurveEditor.tsx` (171 lines). It uses an SVG with
draggable control points that feed into a monotone-Catmull-Rom LUT
(`lib/grading/curve.ts → buildCurveLut`). Right now:

- Points can be dragged.
- Double-click adds/removes points (probably — verify by reading the file).
- The curve is rendered live and feeds the WebGL pipeline.

What's missing or rough: there's no way to quickly snap to common curves
(linear / S-curve / faded film). New users have to manually drag four
points to get a basic look.

## Scope

**You own**: `components/editor/ToneCurveEditor.tsx`. You may also touch
`components/editor/SliderPanel.tsx` ONLY in the small section that
embeds the `<ToneCurveEditor>` (probably just to add a preset dropdown
above the SVG if that's cleaner than putting it inside).

**You do NOT touch**: any other file. No params.ts, no curve.ts shader
math, no other components. If you think you need to, stop and write a
note in your final Status section instead.

## Acceptance criteria

1. **Quick-curve buttons** above or beside the SVG editor: at minimum
   "Linear", "S-curve (medium)", "Faded film". Clicking sets `points`
   to the appropriate preset shape.
2. **Reset button** that returns to the linear identity (two endpoints
   only).
3. **Visual polish**: the existing SVG renders fine but could feel more
   responsive — e.g. larger hit-targets on the control points, hover
   highlight, optional grid lines for the 0.25 / 0.5 / 0.75 quartiles.
4. **No regressions**: drag-to-move, double-click-to-add, double-click-on-point-to-delete (whatever the existing semantics are — preserve them).
5. `pnpm run typecheck` passes.

## Definition of done

- Manual smoke test: load `/editor`, open Adjustments → Tone curve,
  click each preset, verify the rendered photo changes accordingly.
- Branch committed locally as `feature/ticket-001-curve-polish`.
- Append a `## Status` section to this file describing what you did
  and any judgment calls.

## Useful pointers

- `lib/grading/params.ts` defines `CurvePoint = { x: number; y: number }`
  and `DEFAULT_PARAMS.curve.points = [{ x: 0, y: 0 }, { x: 1, y: 1 }]`.
- The existing example presets-style code in `MyPresets.tsx` shows
  how the codebase styles small inline controls.

## Out of scope

- Saving curves to the user-presets DB (use existing "My looks" for
  whole-state snapshots).
- Per-channel (R/G/B) curves — single-channel only.

## Status

(Fill in after work is done.)
