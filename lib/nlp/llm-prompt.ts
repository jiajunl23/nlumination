/**
 * Prompts for Groq's gpt-oss-20b. Strict JSON-schema decoding handles the
 * structural side, so the prompt only needs to nail the *semantics*: what
 * each field means, sensible default magnitudes, and a few worked examples.
 */
import type { GradingParams } from "@/lib/grading/params";
import type { ImageStats } from "@/lib/grading/imageStats";

export const SYSTEM_PROMPT = `You are a photo-editing assistant. Convert the user's
prompt into a JSON object of color-grading parameters that will replace the
current values. Every field is optional — omit any field you don't want to
change. Stay subtle by default; reach for stronger values only when the
prompt clearly asks ("very", "really", "punchy"). Pick fields that match
what the user actually said, not the maximum useful set.

Field semantics and ranges:
- temperature -100..100  (positive = warmer, negative = cooler)
- tint        -100..100  (positive = magenta, negative = green)
- exposure    -3..3      (stops; ±0.3 is gentle, ±1.0 is dramatic)
- contrast, highlights, shadows, whites, blacks  -100..100
- vibrance, saturation, clarity                  -100..100
- vignetteAmount -100..100  (negative darkens corners)
- hsl: per-band { hue, saturation, luminance } each -100..100
       bands: red orange yellow green aqua blue purple magenta
- splitToning: { shadowHue 0..360, shadowSaturation 0..100,
                 highlightHue 0..360, highlightSaturation 0..100,
                 balance -100..100 }
- reasoning: <=160 char human summary of the look you applied.

Examples:
"warmer and contrasty" → {"temperature":25,"contrast":20,
  "reasoning":"warmer white balance with extra punch"}

"moody film look" → {"contrast":15,"shadows":-20,"saturation":-10,
  "splitToning":{"shadowHue":220,"shadowSaturation":25,"balance":-10},
  "reasoning":"moody filmic shadows with cool blue tone"}

"bluer sky" → {"hsl":{"blue":{"saturation":25,"luminance":-5}},
  "reasoning":"deeper blue sky"}

"give it a chilly nordic feeling" → {"temperature":-30,"saturation":-15,
  "highlights":-10,"clarity":-10,
  "splitToning":{"shadowHue":210,"shadowSaturation":15,"balance":-20},
  "reasoning":"cool desaturated nordic palette"}

"like a polaroid from the 80s" → {"contrast":-10,"saturation":-15,
  "blacks":15,"whites":-10,"temperature":15,
  "splitToning":{"shadowHue":40,"shadowSaturation":15,
                 "highlightHue":210,"highlightSaturation":10,"balance":0},
  "reasoning":"faded warm polaroid emulation"}

Reply with JSON only.`;

const NON_DEFAULT_KEYS: ReadonlyArray<{
  key: keyof GradingParams;
  label: string;
}> = [
  { key: "exposure", label: "exposure" },
  { key: "contrast", label: "contrast" },
  { key: "highlights", label: "highlights" },
  { key: "shadows", label: "shadows" },
  { key: "whites", label: "whites" },
  { key: "blacks", label: "blacks" },
  { key: "temperature", label: "temperature" },
  { key: "tint", label: "tint" },
  { key: "vibrance", label: "vibrance" },
  { key: "saturation", label: "saturation" },
  { key: "clarity", label: "clarity" },
];

function summariseCurrent(p: GradingParams): string {
  const parts: string[] = [];
  for (const { key, label } of NON_DEFAULT_KEYS) {
    const v = p[key] as unknown as number;
    if (Math.abs(v) > 0.005) {
      const sign = v > 0 ? "+" : "";
      parts.push(`${label}${sign}${typeof v === "number" ? +v.toFixed(2) : v}`);
    }
  }
  return parts.length ? parts.join(", ") : "pristine";
}

function summariseStats(s: ImageStats | null | undefined): string | null {
  if (!s) return null;
  const luma = s.meanLuminance;
  const lumaTag = luma < 0.3 ? "dark" : luma > 0.7 ? "bright" : "midtones";
  const std = s.stdLuminance;
  const contrastTag = std < 0.12 ? "low-contrast" : std > 0.22 ? "high-contrast" : "moderate-contrast";
  const r = s.meanR, g = s.meanG, b = s.meanB;
  let castTag = "neutral";
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min > 0.06) {
    if (r === max) castTag = "warm-cast";
    else if (b === max) castTag = "cool-cast";
    else if (g === max) castTag = "green-cast";
  }
  return `${lumaTag}, ${contrastTag}, ${castTag}`;
}

export function buildUserPrompt(
  prompt: string,
  current: GradingParams,
  stats: ImageStats | null | undefined,
): string {
  const lines = [
    `Current settings: ${summariseCurrent(current)}.`,
  ];
  const photo = summariseStats(stats);
  if (photo) lines.push(`Photo: ${photo}.`);
  lines.push(`User prompt: ${prompt}`);
  return lines.join("\n");
}
