/**
 * Adaptive scalers — per-intent multipliers that adjust prompt magnitude
 * based on the actual photo. "Brighten" on an already-bright photo
 * shrinks toward zero; "warm" on a sunset photo doesn't push past
 * believable; "crush blacks" on already-crushed shadows barely moves.
 *
 * All scalers return a multiplier in roughly [0.2, 1.5]. The parser
 * multiplies the intent's `amount` by this AND by any modifier scale
 * the user typed (e.g. "subtly", "very").
 *
 * Heuristics; not learned. Tuned for the 256-px downsample produced
 * by `lib/grading/imageStats.ts`.
 */

import type { ImageStats } from "@/lib/grading/imageStats";

export type AdaptiveKey =
  | "brighten"
  | "darken"
  | "warm"
  | "cool"
  | "contrastUp"
  | "contrastDown"
  | "highlightsPull"
  | "blacksDeepen"
  | "shadowsLift"
  | "saturationUp";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const SCALERS: Record<AdaptiveKey, (s: ImageStats) => number> = {
  // Bright photo → small effect; dark photo → strong effect.
  brighten: (s) => clamp(0.4 + 1.8 * (1 - s.meanLuminance), 0.3, 1.5),
  // Dark photo → small; bright → strong.
  darken: (s) => clamp(0.4 + 1.8 * s.meanLuminance, 0.3, 1.5),

  // Warmth = R/B ratio. Already warm → don't push further.
  warm: (s) => {
    const warmth = s.meanR / Math.max(s.meanB, 0.01);
    return clamp(2.2 - 1.0 * warmth, 0.3, 1.4);
  },
  cool: (s) => {
    const warmth = s.meanR / Math.max(s.meanB, 0.01);
    return clamp(0.5 + 0.6 * warmth, 0.3, 1.4);
  },

  // Std-dev of luminance is a contrast proxy. Flat → boost; punchy → reduce.
  contrastUp: (s) => clamp(2.0 - 5.0 * s.stdLuminance, 0.4, 1.4),
  contrastDown: (s) => clamp(-0.5 + 5.0 * s.stdLuminance, 0.3, 1.4),

  // Already-clipped highlights (p95 near 1) → full pull. Headroom → small effect.
  highlightsPull: (s) => clamp((s.p95Luminance - 0.6) * 3, 0.2, 1.4),

  // Already-crushed blacks (p05 near 0) → small. Lifted blacks → strong deepen.
  blacksDeepen: (s) => clamp(0.3 + 4.0 * s.p05Luminance, 0.2, 1.4),
  // Inverse: already lifted → small. Crushed → strong lift.
  shadowsLift: (s) => clamp(1.5 - 4.0 * s.p05Luminance, 0.2, 1.4),

  // Mean chroma proxy via R/G/B spread. Already saturated → small.
  saturationUp: (s) => {
    const mean = (s.meanR + s.meanG + s.meanB) / 3;
    const spread =
      (Math.abs(s.meanR - mean) +
        Math.abs(s.meanG - mean) +
        Math.abs(s.meanB - mean)) /
      3;
    // spread ≈ 0.02 on a desaturated photo, ~0.12 on a saturated one.
    return clamp(1.4 - 6.0 * spread, 0.4, 1.4);
  },
};

export function adaptiveScale(
  key: AdaptiveKey | undefined,
  stats: ImageStats | null | undefined,
): number {
  if (!key || !stats) return 1;
  const fn = SCALERS[key];
  return fn ? fn(stats) : 1;
}
