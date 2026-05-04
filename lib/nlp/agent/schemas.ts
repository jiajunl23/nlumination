/**
 * Output contracts for Agents 1 and 2 (the analysts). Agent 3 reuses
 * `LLMDelta` from `lib/nlp/llm-schema.ts`, so it isn't duplicated here.
 *
 * Design philosophy: free-form structured. Where a human would naturally
 * write a sentence ("the shadow region has a slight green cast that
 * 'cinematic' might exacerbate"), we keep `string`. Where there's a
 * genuinely small, stable taxonomy ("+"/"-", "subtle"/"moderate"/"strong"),
 * we use `z.enum` so model drift gets rejected by Zod and the next
 * generation gets corrected.
 *
 * Length caps exist for token economy — strings can't drift to paragraphs;
 * arrays can't grow unbounded. The numbers are deliberately generous
 * (200-280 chars per free-text field) so analysts have room to be useful.
 *
 * The JSON Schema mirrors are sent to Groq's `response_format`. Mirrors
 * are hand-maintained — same convention as `llm-schema.ts`. If you change
 * a Zod field, update the mirror.
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────
// Agent 1 — Emotion Analyst
// ────────────────────────────────────────────────────────────────────────

const QUALITY_INTENSITIES = ["subtle", "moderate", "strong"] as const;

export const DetectedQuality = z
  .object({
    /** Free-form quality name — "warmth", "grit", "nostalgic_chill", anything. */
    name: z.string().min(1).max(64),
    direction: z.enum(["+", "-"]),
    intensity: z.enum(QUALITY_INTENSITIES),
    /** Why the model thinks this quality is present. Anchors the trace UI. */
    rationale: z.string().min(1).max(160),
  })
  .strict();

export const ExplicitTerm = z
  .object({
    /** The literal phrase from the user prompt — "chiaroscuro", "golden hour". */
    term: z.string().min(1).max(64),
    /** Model's interpretation in this user's context. */
    meaning: z.string().min(1).max(200),
    /** How that meaning maps to grading params, in plain English. */
    photographic_translation: z.string().min(1).max(200),
  })
  .strict();

// 20B model occasionally omits required fields under strict: false. Use
// `.default()` on the most-often-missed ones so a partial response from
// Groq still parses to a usable brief. Zod's `.optional().default(x)`
// makes a field optional in input but always present after parsing.
export const EmotionAnalysis = z
  .object({
    mood_description: z.string().max(280).optional().default(""),
    detected_qualities: z.array(DetectedQuality).max(8).optional().default([]),
    explicit_terms: z.array(ExplicitTerm).max(6).optional().default([]),
    caveats: z.array(z.string().min(1).max(160)).max(4).optional().default([]),
    summary: z.string().max(200).optional().default(""),
  })
  .strict();

export type EmotionAnalysisT = z.infer<typeof EmotionAnalysis>;

// ────────────────────────────────────────────────────────────────────────
// Agent 2 — Image Mood Analyst
// ────────────────────────────────────────────────────────────────────────

export const NotableObservation = z
  .object({
    /** Free-form aspect name — "luminance", "shadow color cast", anything. */
    aspect: z.string().min(1).max(64),
    /** Concrete numeric / visual finding. */
    finding: z.string().min(1).max(200),
    /** What that finding implies for safe modification. */
    implication: z.string().min(1).max(200),
  })
  .strict();

export const ModificationGuidance = z
  .object({
    safe_directions: z
      .array(z.string().min(1).max(160))
      .max(6)
      .optional()
      .default([]),
    risky_directions: z
      .array(z.string().min(1).max(160))
      .max(6)
      .optional()
      .default([]),
    notes: z.string().max(280).optional().default(""),
  })
  .strict();

export const ImageMoodAnalysis = z
  .object({
    visual_personality: z.string().max(280).optional().default(""),
    notable_observations: z
      .array(NotableObservation)
      .max(6)
      .optional()
      .default([]),
    modification_guidance: ModificationGuidance.optional().default({
      safe_directions: [],
      risky_directions: [],
      notes: "",
    }),
    summary: z.string().max(200).optional().default(""),
  })
  .strict();

export type ImageMoodAnalysisT = z.infer<typeof ImageMoodAnalysis>;

// ────────────────────────────────────────────────────────────────────────
// JSON Schema mirrors for Groq `response_format: { type: "json_schema" }`
// Hand-maintained — keep in sync with the Zod definitions above.
// ────────────────────────────────────────────────────────────────────────

// JSON Schema mirrors. Deliberately permissive — no `required` arrays,
// no `minLength`. Groq's strict:false still validates against whatever
// constraints we list, so any rigor here can reject otherwise-useful
// partial output from the 20B model. Zod (above) re-validates and fills
// missing fields with defaults; the JSON Schema's job is to GUIDE the
// model toward the expected shape, not to gatekeep.
const strMax = (max: number) => ({
  type: "string" as const,
  maxLength: max,
});

const detectedQualityProps = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    name: strMax(64),
    direction: { type: "string" as const, enum: ["+", "-"] },
    intensity: { type: "string" as const, enum: [...QUALITY_INTENSITIES] },
    rationale: strMax(160),
  },
};

const explicitTermProps = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    term: strMax(64),
    meaning: strMax(200),
    photographic_translation: strMax(200),
  },
};

export const EMOTION_ANALYSIS_JSON_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    mood_description: strMax(280),
    detected_qualities: {
      type: "array" as const,
      maxItems: 8,
      items: detectedQualityProps,
    },
    explicit_terms: {
      type: "array" as const,
      maxItems: 6,
      items: explicitTermProps,
    },
    caveats: {
      type: "array" as const,
      maxItems: 4,
      items: strMax(160),
    },
    summary: strMax(200),
  },
};

const notableObservationProps = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    aspect: strMax(64),
    finding: strMax(200),
    implication: strMax(200),
  },
};

const modificationGuidanceProps = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    safe_directions: {
      type: "array" as const,
      maxItems: 6,
      items: strMax(160),
    },
    risky_directions: {
      type: "array" as const,
      maxItems: 6,
      items: strMax(160),
    },
    notes: strMax(280),
  },
};

export const IMAGE_MOOD_ANALYSIS_JSON_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    visual_personality: strMax(280),
    notable_observations: {
      type: "array" as const,
      maxItems: 6,
      items: notableObservationProps,
    },
    modification_guidance: modificationGuidanceProps,
    summary: strMax(200),
  },
};
