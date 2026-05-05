/**
 * Prompts for Groq's gpt-oss-20b. We use json_object mode (not json_schema)
 * to skip the schema-as-input cost — Zod + clamp() in mergeDelta handle
 * validation post-hoc. The prompt has to carry the field list itself, but
 * compactly: one line of ranges, one worked example.
 */
import type { GradingParams } from "@/lib/grading/params";
import type { ImageStats } from "@/lib/grading/imageStats";

export const SYSTEM_PROMPT = `You are a photo-editing assistant. Convert the user's
prompt into a JSON delta of color-grading parameters that REPLACES the current
values. All fields optional — omit fields you don't want to change. Stay subtle
unless the prompt asks otherwise.

Fields (all -100..100 unless noted):
temperature tint contrast highlights shadows whites blacks vibrance saturation
clarity vignetteAmount; exposure -3..3; hsl.{red|orange|yellow|green|aqua|blue|
purple|magenta}.{hue,saturation,luminance}; splitToning.{shadowHue 0..360,
shadowSaturation 0..100, highlightHue 0..360, highlightSaturation 0..100,
balance -100..100}; reasoning (<=160 chars).

Example — "polaroid from the 80s":
{"contrast":-10,"saturation":-15,"blacks":15,"whites":-10,"temperature":15,
"splitToning":{"shadowHue":40,"shadowSaturation":15,"highlightHue":210,
"highlightSaturation":10,"balance":0},"reasoning":"faded warm polaroid"}

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
