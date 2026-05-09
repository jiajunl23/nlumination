/**
 * Three lightweight prompts for the redesigned agents pipeline.
 *
 * A1 / A2 emit a SINGLE plain-text sentence each (no JSON, no tool call,
 * no structured schema). The cost saving compared to the original
 * structured schemas is huge: a tool spec with EmotionAnalysis JSON
 * Schema was ~500 input tokens per call, plus the model spent another
 * ~350 visible tokens filling it in. A sentence is ~50 tokens.
 *
 * A3 stays structured — it produces the actual LLMDelta JSON via
 * json_object mode (mirrors the LLM-mode call). It reads A1+A2's
 * sentences as context, plus the raw user prompt and current settings.
 *
 * gpt-oss-20b is small enough that a worked example helps, so each
 * prompt carries one — but only one, and inline.
 */

import type { GradingParams } from "@/lib/grading/params";
import type { ImageStats } from "@/lib/grading/imageStats";
import type { TurnRecord } from "./state";
import { summariseHistory } from "@/lib/nlp/history-summary";

// ────────────────────────────────────────────────────────────────────────
// Agent 1 — Emotion Analyst (free-form text output)
// ────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT_EMOTION = `You translate a photo-grading prompt into a
short description of the emotional/aesthetic mood the user wants and the
photographic style/theme that fits.

Reply with 1-2 sentences (≤60 words), plain text, no JSON. Cover:
- the mood/feeling (warm, melancholy, punchy, calm, etc.)
- the visual style/theme (golden-hour cinematic, chilly nordic, faded film, etc.)
- any explicit caveat ("but not too dark", "subtle", "very saturated")

Example:
USER: "moody and contemplative, but not too dark — like late autumn afternoon"
YOU: Subdued reflective mood with warm late-afternoon character; raised shadows for openness rather than crushed darkness; warm-leaning fall vibe.`;

export function buildEmotionUserPrompt(
  userPrompt: string,
  history: readonly TurnRecord[] = [],
): string {
  const lines = [`USER: ${userPrompt}`];
  const trail = summariseHistory(history);
  if (trail) lines.push("", trail);
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────────
// Agent 2 — Image Mood Analyst (free-form text output)
// ────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT_IMAGE_MOOD = `You read pre-computed image
statistics and write ONE sentence describing the photo's current
character.

Reply with 1 sentence (≤40 words), plain text, no JSON. Cover:
- brightness/contrast character (dim, balanced, bright; flat, punchy)
- color cast if any (warm, cool, neutral, slight green)
- one practical headroom note (e.g. "shadow density preserved", "highlight room limited", "ample contrast headroom")

Stats fields: meanLuminance/stdLuminance (0..1), p05/p95Luminance (true black/white points), meanR/G/B (channel means).

Example:
INPUT: meanLuminance=0.32, stdLuminance=0.10, p05=0.05, p95=0.62, meanR=0.34, meanG=0.31, meanB=0.30
YOU: Dim and flat with a slight warm cast; shadow density preserved (p05=0.05) but highlight room limited (p95=0.62).`;

const NON_DEFAULT_KEYS_FOR_PARAMS_SUMMARY: ReadonlyArray<{
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

function summariseParams(p: GradingParams): string {
  const parts: string[] = [];
  for (const { key, label } of NON_DEFAULT_KEYS_FOR_PARAMS_SUMMARY) {
    const v = p[key] as unknown as number;
    if (Math.abs(v) > 0.005) {
      const sign = v > 0 ? "+" : "";
      parts.push(`${label}${sign}${+v.toFixed(2)}`);
    }
  }
  return parts.length ? parts.join(", ") : "pristine";
}

export function buildImageMoodUserPrompt(stats: ImageStats | null): string {
  if (!stats) return "Stats: not available";
  return `meanLuminance=${stats.meanLuminance.toFixed(3)}, stdLuminance=${stats.stdLuminance.toFixed(3)}, p05=${stats.p05Luminance.toFixed(3)}, p95=${stats.p95Luminance.toFixed(3)}, meanR=${stats.meanR.toFixed(3)}, meanG=${stats.meanG.toFixed(3)}, meanB=${stats.meanB.toFixed(3)}`;
}

// ────────────────────────────────────────────────────────────────────────
// Agent 2 (VLM variant) — sees the actual photo via Llama-4-Scout
// ────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT_IMAGE_VLM = `You are an image analyst for a
photo color-grading tool. Look at the photo and write ONE sentence (≤40
words) describing:

- subject type (portrait / landscape / cityscape / object / abstract / mixed)
- lighting (time of day if outdoor; soft/harsh; indoor lamp / window / mixed)
- existing color/mood character (warm / cool / muted / saturated / contrasty / flat)
- one obvious flaw to address, if any (blown highlights, crushed shadows,
  green cast, clipping)

Plain text. No JSON. No markdown. No mention of people's identity. No OCR.

Example: A backlit portrait at golden hour with warm muted tones; gentle
soft light from camera-right; lifted shadows are slightly milky and could
benefit from added contrast.`;

/**
 * Build the multi-part `content` for the OpenAI-compatible image_url
 * message. Numerics are passed alongside as a sanity anchor — VLMs
 * occasionally misjudge cast on heavily-saturated photos; the numbers
 * ground the description.
 */
export function buildImageMoodVlmContent(
  imageUrl: string,
  stats: ImageStats | null,
): Array<
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
> {
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [];
  if (stats) {
    parts.push({
      type: "text",
      text: `Numerics for cross-check: ${buildImageMoodUserPrompt(stats)}`,
    });
  }
  parts.push({ type: "image_url", image_url: { url: imageUrl } });
  return parts;
}

// ────────────────────────────────────────────────────────────────────────
// Agent 3 — Action Agent (JSON delta via json_object mode)
// ────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT_ACTION = `You convert two short briefs (mood + image
character) plus a user prompt into a JSON delta of grading params that
REPLACES the current values. All fields optional.

Fields (all -100..100 unless noted):
temperature tint contrast highlights shadows whites blacks vibrance saturation
clarity vignetteAmount; exposure -3..3; hsl.{red|orange|yellow|green|aqua|blue|
purple|magenta}.{hue,saturation,luminance}; splitToning.{shadowHue 0..360,
shadowSaturation 0..100, highlightHue 0..360, highlightSaturation 0..100,
balance -100..100}; reasoning (≤160 chars, plain summary).

CRITICAL: hsl bands are EXACTLY these 8: red, orange, yellow, green, aqua,
blue, purple, magenta. Use **aqua** (NOT cyan), **magenta** (NOT pink). Any
other band name will be silently dropped.

Magnitude rules: subtle ±5–10 (exposure ±0.1), moderate ±15–25 (exp ±0.3),
strong ±30–50 (exp ±0.7). Compound looks (vintage, cinematic, golden hour,
nordic, polaroid…) usually want 8–14 fields working together: white-balance
+ light + presence + at least one matching hsl band + splitToning. Single-
axis prompts ("warmer", "more contrast") legitimately stay 1–2 fields.

Use the IMAGE brief to decide magnitudes — if it says "highlight room
limited", don't push whites; if it says "shadow density preserved", lifting
shadows is safe.

Example:
USER: warm cinematic golden-hour with raised shadows
EMOTION: Warm cinematic look with golden-hour atmosphere; lifted shadows for openness; filmic contrast.
IMAGE: Balanced midtones, neutral cast; ample contrast headroom and shadow room, mild highlight ceiling.
CURRENT: pristine
YOU: {"exposure":0.15,"temperature":18,"tint":3,"contrast":20,"highlights":-10,"shadows":28,"blacks":-6,"vibrance":12,"saturation":-4,"clarity":6,"hsl":{"orange":{"saturation":15,"luminance":4},"yellow":{"saturation":10}},"splitToning":{"shadowHue":30,"shadowSaturation":18,"highlightHue":40,"highlightSaturation":12,"balance":-10},"reasoning":"warm cinematic golden-hour with lifted shadows and amber split-tone"}

Reply with JSON only.`;

export function buildActionUserPrompt(
  userPrompt: string,
  emotion: string | null,
  imageMood: string | null,
  current: GradingParams,
  history: readonly TurnRecord[] = [],
): string {
  const lines = [
    `USER: ${userPrompt}`,
    `EMOTION: ${emotion ?? "(analyst failed — infer from user prompt)"}`,
    `IMAGE: ${imageMood ?? "(analyst failed — no image-aware guidance)"}`,
    `CURRENT: ${summariseParams(current)}`,
  ];
  const trail = summariseHistory(history);
  if (trail) lines.push("", trail);
  return lines.join("\n");
}
