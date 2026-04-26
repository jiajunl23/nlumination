import type { Modifier } from "./types";

/**
 * Adverbs that scale the magnitude of an intent. Some adverbs come before
 * the intent ("subtly warm"), some come after ("warmer a bit"), and
 * "really" / "very" etc. can do either. The parser pairs each modifier
 * with the closest intent according to `position` rules.
 */
export const MODIFIERS: Modifier[] = [
  // ── Pre-fixed amplifiers / dampeners ──
  { phrases: ["very", "extremely", "super"], scale: 1.6, position: "pre" },
  { phrases: ["really"], scale: 1.3, position: "pre" },
  { phrases: ["subtly", "slightly"], scale: 0.45, position: "pre" },

  // ── Either position (forward-preference) ──
  { phrases: ["a bit", "a touch", "a little"], scale: 0.65, position: "either" },

  // ── Negation / "less" ──
  { phrases: ["less", "not too"], scale: 0.5, invert: true, position: "pre" },
  { phrases: ["no", "don't"], scale: 1, invert: true, position: "pre" },
];
