/**
 * SYSTEM_PROMPTs and user-message builders for the three agents.
 *
 * Each prompt is intentionally short and single-purpose. gpt-oss-20b is a
 * 20B model — its in-context learning relies heavily on a worked example,
 * so each prompt carries one. The examples are mini-cases (not real
 * scenarios) chosen to demonstrate the expected output shape, not to
 * leak real-world bias.
 *
 * Why three prompts and not one with role-switching? Each prompt becomes
 * its own request to Groq — the model sees only that prompt. Mixing
 * roles in one prompt would confuse the structured-output decoder
 * (different schemas per agent).
 */

import type { GradingParams } from "@/lib/grading/params";
import type { ImageStats } from "@/lib/grading/imageStats";
import type { EmotionAnalysisT, ImageMoodAnalysisT } from "./schemas";
import { PRESETS } from "@/lib/nlp/presets";

// ────────────────────────────────────────────────────────────────────────
// Agent 1 — Emotion Analyst
// ────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT_EMOTION = `You are an emotion analyst for a photo
grading tool. Read the user's prompt and produce a structured JSON object
describing what they want emotionally and aesthetically. You don't decide
grading values — that's the action agent's job. Stay grounded in what the
user *actually said*; never invent qualities they didn't describe.

Output schema:
{
  mood_description: 1–2 sentence overall picture
  detected_qualities: [{name, direction "+"|"-", intensity "subtle"|"moderate"|"strong", rationale}]
  explicit_terms:    [{term, meaning, photographic_translation}]
  caveats:           [string]
  summary:           1-line brief for the action agent
}

Guidelines:
- For each detected_quality, pick a name that fits this user's vibe; free-form, not a fixed list.
- explicit_terms covers photographic vocabulary (chiaroscuro, golden hour, high-key, …) — explain
  the term in this context AND translate it to grading-param implications.
- If the prompt is ambiguous or empty, leave detected_qualities/explicit_terms as [] and explain
  the ambiguity in mood_description. Do not fabricate.
- intensity is qualitative ("subtle"/"moderate"/"strong"), never a number.
- caveats lists internal tensions ("wants moody but explicitly says 'not too dark'"). Empty array if none.

Worked example:
USER: "moody and contemplative, but not too dark — like late autumn afternoon"
OUTPUT:
{"mood_description":"moody and contemplative with warm fall character; user wants atmosphere without losing readability","detected_qualities":[{"name":"melancholy","direction":"+","intensity":"moderate","rationale":"'contemplative' and 'moody' point to a subdued reflective tone"},{"name":"warmth","direction":"+","intensity":"subtle","rationale":"'late autumn afternoon' suggests low-angle warm light"},{"name":"darkness","direction":"-","intensity":"subtle","rationale":"explicit caveat 'not too dark'"}],"explicit_terms":[{"term":"late autumn afternoon","meaning":"warm low-angle light, slightly desaturated, soft shadows","photographic_translation":"+temperature, mild contrast, lifted shadows, slight saturation reduction"}],"caveats":["moody mood vs explicit 'not too dark' — keep shadows present but don't crush them"],"summary":"warm-leaning moody fall vibe with raised shadows"}

Reply with JSON only.`;

export function buildEmotionUserPrompt(userPrompt: string): string {
  return `User prompt: ${userPrompt}`;
}

// ────────────────────────────────────────────────────────────────────────
// Agent 2 — Image Mood Analyst
// ────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT_IMAGE_MOOD = `You are an image analyst for a photo
grading tool. Read the photo's current statistics and current grading state,
and produce a structured JSON describing the image's "personality" and
where it has headroom for modification. You don't decide grading values —
that's the action agent's job. Cite specific numbers; don't make claims
you can't back up with the stats given.

Stats fields:
- meanLuminance, stdLuminance: 0..1 (mean brightness, contrast)
- p05Luminance, p95Luminance: 5th/95th percentile (true black/white points)
- meanR, meanG, meanB: 0..1 channel means (proxy for color cast)

Output schema:
{
  visual_personality:   1–2 sentence overall picture
  notable_observations: [{aspect, finding, implication}]
  modification_guidance: {safe_directions[], risky_directions[], notes}
  summary:              1-line brief for the action agent
}

Guidelines:
- finding cites actual numbers (e.g. "p05 = 0.05").
- implication says what that means for safe modification.
- safe_directions are concrete imperatives ("lift shadows up to +30").
- risky_directions always include a reason inline ("more warmth — already warm cast").
- If stats are missing or extreme, still produce something useful.

Worked example:
INPUT:
Stats: meanLuminance=0.32, stdLuminance=0.10, p05=0.05, p95=0.62, meanR=0.34, meanG=0.31, meanB=0.30
Current settings: pristine
OUTPUT:
{"visual_personality":"dim and slightly flat, with preserved shadow density and a compressed highlight range; mostly neutral with a faint warm cast","notable_observations":[{"aspect":"luminance","finding":"meanLuminance=0.32 with p95=0.62","implication":"image is dark and lacks highlight headroom — exposure can be lifted, but pushing whites may clip"},{"aspect":"contrast","finding":"stdLuminance=0.10 — quite flat","implication":"contrast can be increased meaningfully"},{"aspect":"shadow density","finding":"p05=0.05 — true black preserved","implication":"shadows can be lifted up to +30 without crushing"},{"aspect":"color cast","finding":"meanR=0.34 > meanB=0.30","implication":"slight warm cast — pushing temperature warmer is risky"}],"modification_guidance":{"safe_directions":["increase exposure up to +0.5","increase contrast up to +25","lift shadows up to +30"],"risky_directions":["push warmer (already warm-cast)","raise whites aggressively (compressed highlight range)"],"notes":"Good candidate for moody-leaning treatments; flat midtones welcome punch."},"summary":"dim, flat, slight warm cast — plenty of contrast/shadow headroom but limited highlight room"}

Reply with JSON only.`;

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

export function buildImageMoodUserPrompt(
  stats: ImageStats | null,
  current: GradingParams,
): string {
  const statsLine = stats
    ? `Stats: meanLuminance=${stats.meanLuminance.toFixed(3)}, stdLuminance=${stats.stdLuminance.toFixed(3)}, p05=${stats.p05Luminance.toFixed(3)}, p95=${stats.p95Luminance.toFixed(3)}, meanR=${stats.meanR.toFixed(3)}, meanG=${stats.meanG.toFixed(3)}, meanB=${stats.meanB.toFixed(3)}`
    : `Stats: not available`;
  return `${statsLine}\nCurrent settings: ${summariseParams(current)}`;
}

// ────────────────────────────────────────────────────────────────────────
// Agent 3 — Action Agent (with optional applyPreset tool)
// ────────────────────────────────────────────────────────────────────────

const PRESET_CATALOG_BLOCK = PRESETS.map(
  (p) => `- ${p.id}: ${p.description}`,
).join("\n");

export const SYSTEM_PROMPT_ACTION = `You are the action agent for a photo
grading tool. You receive two structured briefs (an emotion brief from
Agent 1 and an image-mood brief from Agent 2) plus the current grading
params. Produce a JSON delta of grading values that fulfills the
emotional intent given the image's current state.

You communicate ONLY via tool calls. Two tools available:

1. \`applyPreset(name)\` — OPTIONAL preview. Pass a preset id; you receive
   the diff that preset would create on top of the current params.
   Useful when the user's prompt clearly maps to a named look. You may
   call this AT MOST ONCE.

2. \`submitFinalDelta(...)\` — REQUIRED final answer. The args of this
   call ARE your final LLMDelta output. ALL fields optional — include
   only what you want to change.

Available preset ids for applyPreset:
${PRESET_CATALOG_BLOCK}

Final delta fields (pass to submitFinalDelta):
- temperature, tint, contrast, highlights, shadows, whites, blacks,
  vibrance, saturation, clarity, vignetteAmount: -100..100
- exposure: -3..3 (stops; ±0.3 is gentle, ±1.0 is dramatic)
- hsl: per-band {hue, saturation, luminance} each -100..100
       bands: red orange yellow green aqua blue purple magenta
- splitToning: {shadowHue 0..360, shadowSaturation 0..100,
                highlightHue 0..360, highlightSaturation 0..100,
                balance -100..100}
- reasoning: <=160 char human summary of the look you applied

Decision rules:
- Skip applyPreset if no preset clearly fits — call submitFinalDelta directly.
- Use safe_directions and risky_directions to decide magnitudes.
- Stay subtle by default; reach for stronger values only for "very/really" or strong intensity in the brief.
- If a brief is missing (analyst failed), infer from raw user prompt and acknowledge in reasoning.
- Every numeric must lie in the range above.

Worked example (skip preset, direct final delta):
EMOTION BRIEF: warm-leaning moody fall vibe with raised shadows
IMAGE BRIEF:   dim, flat, slight warm cast — plenty of contrast/shadow headroom
ACTION:        call submitFinalDelta({"temperature":12,"contrast":18,"shadows":22,"highlights":-10,"saturation":-8,"splitToning":{"shadowHue":30,"shadowSaturation":14,"balance":-10},"reasoning":"warm fall mood with lifted shadows; gentle contrast since image already flat"})`;

export function buildActionUserPrompt(
  userPrompt: string,
  emotion: EmotionAnalysisT | null,
  imageMood: ImageMoodAnalysisT | null,
  current: GradingParams,
): string {
  const lines: string[] = [];
  lines.push(`USER PROMPT: ${userPrompt}`);
  lines.push("");

  if (emotion) {
    lines.push(`EMOTION BRIEF (Agent 1):`);
    lines.push(`- summary: ${emotion.summary}`);
    lines.push(`- mood: ${emotion.mood_description}`);
    if (emotion.detected_qualities.length) {
      const q = emotion.detected_qualities
        .map((dq) => `${dq.name}${dq.direction} (${dq.intensity})`)
        .join(", ");
      lines.push(`- qualities: ${q}`);
    }
    if (emotion.explicit_terms.length) {
      lines.push(
        `- terms: ` +
          emotion.explicit_terms
            .map((t) => `${t.term} → ${t.photographic_translation}`)
            .join("; "),
      );
    }
    if (emotion.caveats.length) {
      lines.push(`- caveats: ${emotion.caveats.join("; ")}`);
    }
  } else {
    lines.push(`EMOTION BRIEF: (analyst failed — infer from raw user prompt)`);
  }
  lines.push("");

  if (imageMood) {
    lines.push(`IMAGE BRIEF (Agent 2):`);
    lines.push(`- summary: ${imageMood.summary}`);
    lines.push(`- personality: ${imageMood.visual_personality}`);
    const safe = imageMood.modification_guidance.safe_directions;
    const risky = imageMood.modification_guidance.risky_directions;
    if (safe.length) lines.push(`- safe: ${safe.join("; ")}`);
    if (risky.length) lines.push(`- risky: ${risky.join("; ")}`);
    if (imageMood.modification_guidance.notes) {
      lines.push(`- notes: ${imageMood.modification_guidance.notes}`);
    }
  } else {
    lines.push(`IMAGE BRIEF: (analyst failed — no image-aware guidance)`);
  }
  lines.push("");

  lines.push(`Current settings: ${summariseParams(current)}`);
  return lines.join("\n");
}
