/**
 * Helpers that turn a parser result + before/after params into the strings
 * shown in the chat-style prompt panel:
 *
 *   applied: +0.40 EV, blue shadows, cinematic
 *   → if you want more moody, slide Shadows down
 *
 * `summarizeApplied` mixes numeric deltas (top-level light/color sliders)
 * with the human descriptions of preset/compound intents so the user can
 * read "what just changed" at a glance.
 */

import type { GradingParams } from "@/lib/grading/params";
import type { ParseResult } from "./types";

const EPS = 0.005;

// Keep this in user-visible order so the summary reads naturally.
const NUMERIC_KEYS: ReadonlyArray<{
  key: keyof GradingParams;
  label: string;
  precision: number;
}> = [
  { key: "exposure", label: "EV", precision: 2 },
  { key: "contrast", label: "contrast", precision: 0 },
  { key: "highlights", label: "highlights", precision: 0 },
  { key: "shadows", label: "shadows", precision: 0 },
  { key: "whites", label: "whites", precision: 0 },
  { key: "blacks", label: "blacks", precision: 0 },
  { key: "temperature", label: "temp", precision: 0 },
  { key: "tint", label: "tint", precision: 0 },
  { key: "vibrance", label: "vibrance", precision: 0 },
  { key: "saturation", label: "saturation", precision: 0 },
  { key: "clarity", label: "clarity", precision: 0 },
];

export function summarizeApplied(
  before: GradingParams,
  after: GradingParams,
  understood: ParseResult["understood"],
): string[] {
  const parts: string[] = [];

  for (const { key, label, precision } of NUMERIC_KEYS) {
    const a = before[key] as unknown as number;
    const b = after[key] as unknown as number;
    const d = b - a;
    if (Math.abs(d) > EPS) {
      const sign = d > 0 ? "+" : "";
      parts.push(`${sign}${d.toFixed(precision)} ${label}`);
    }
  }

  // Compound / preset descriptions (split-tone, HSL bands, named looks) won't
  // show up as deltas above — surface them via the parser's understood list.
  const seen = new Set<string>();
  for (const u of understood) {
    if (isCompoundOrPreset(u.description) && !seen.has(u.description)) {
      seen.add(u.description);
      parts.push(u.description);
    }
  }

  return parts;
}

function isCompoundOrPreset(description: string): boolean {
  // These strings come from intents.ts. Numeric-only intents have descriptions
  // like "lift exposure" / "more contrast" that are already covered by the
  // delta block, so we filter them out to avoid duplication.
  const numericOnly = new Set([
    "lift exposure",
    "drop exposure",
    "tame overexposure",
    "rescue underexposure",
    "more contrast",
    "less contrast",
    "warmer",
    "cooler",
    "shift yellow",
    "shift blue",
    "shift pink",
    "shift green",
    "more saturated",
    "muted color",
    "more vibrance",
    "more clarity",
    "softer",
    "pull highlights",
    "open shadows",
    "deepen blacks",
    "raise whites",
  ]);
  return !numericOnly.has(description);
}

const HINTS_BY_DESC: Record<string, string> = {
  moody: "slide Shadows down or drop Exposure",
  "blue shadows": "open Split Toning and drag the shadow color toward blue",
  "teal shadows": "set the shadow hue near 185°",
  "green shadows": "set the shadow hue near 130°",
  "pink highlights": "set the highlight hue near 340°",
  "orange highlights": "set the highlight hue near 30°",
  "yellow highlights": "set the highlight hue near 50°",
  "cinematic teal-orange": "boost Vibrance and tweak the Orange and Aqua HSL bands",
  "film emulation": "raise Blacks slightly and lower Whites for that lifted look",
  "vintage fade": "lift Blacks and lower Saturation for a faded mood",
  "bright & airy": "raise Exposure and Highlights, drop Saturation a touch",
  "morning mist": "drop Contrast and lower Vibrance",
  cyberpunk: "boost Saturation; tint highlights pink and shadows teal",
  "golden hour": "warm the Temperature and lift Orange saturation",
  "deepen blue sky": "in HSL, drop the Blue luminance",
  "deepen greens": "in HSL, drop the Green luminance",
  "skin warmth": "in HSL, lift the Orange luminance",
  "sunset glow": "drag Orange and Yellow saturation up",
  "deepen reds": "in HSL, drop the Red luminance",
  "darken corners": "drop the Vignette amount under Effects",
  "black & white": "drag Saturation to -100",
};

export function suggestionFor(understood: ParseResult["understood"]): string | undefined {
  for (const u of understood) {
    const hint = HINTS_BY_DESC[u.description];
    if (hint) return `if you want more ${u.description}, ${hint}`;
  }
  return undefined;
}
