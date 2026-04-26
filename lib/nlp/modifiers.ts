import type { Modifier } from "./types";

/**
 * Adverbs that scale the magnitude of an intent. Some adverbs come *before*
 * the intent ("稍微暖"), some come *after* ("暖一点"), and "really"/"very"
 * etc. can do either.
 *
 * The parser pairs each modifier with the closest intent according to
 * `position` rules.
 */
export const MODIFIERS: Modifier[] = [
  // ── Pre-fixed amplifiers / dampeners ──
  { phrases: ["非常", "极", "极度", "超级", "巨"], scale: 1.6, position: "pre" },
  { phrases: ["很", "挺", "蛮"], scale: 1.3, position: "pre" },
  { phrases: ["稍微", "略", "略微"], scale: 0.45, position: "pre" },

  // ── Post-fixed degree suffixes ──
  { phrases: ["一点点", "一丢丢"], scale: 0.4, position: "post" },
  { phrases: ["一点", "一些", "点", "些"], scale: 0.7, position: "post" },

  // ── Negation / "less" (commonly pre) ──
  { phrases: ["别太", "不要太"], scale: 0.5, invert: true, position: "pre" },
  { phrases: ["不要", "别"], scale: 1, invert: true, position: "pre" },

  // ── English (mostly pre, but "a bit" / "a little" can go either way) ──
  { phrases: ["very", "extremely", "super"], scale: 1.6, position: "pre" },
  { phrases: ["really"], scale: 1.3, position: "pre" },
  { phrases: ["subtly", "slightly"], scale: 0.45, position: "pre" },
  { phrases: ["a bit", "a touch", "a little"], scale: 0.65, position: "either" },
  { phrases: ["less", "not too"], scale: 0.5, invert: true, position: "pre" },
  { phrases: ["no", "don't"], scale: 1, invert: true, position: "pre" },
];
