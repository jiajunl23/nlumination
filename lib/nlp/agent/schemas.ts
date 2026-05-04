/**
 * Output contracts for Agents 1 and 2 (the analysts). Agent 3 reuses
 * `LLMDelta` from `lib/nlp/llm-schema.ts`, so it isn't duplicated here.
 *
 * Design philosophy: free-form structured. Where a human would naturally
 * write a sentence, we keep `string`. Where there's a small stable
 * taxonomy ("+"/"-", "subtle"/"moderate"/"strong"), we use `z.enum`.
 *
 * Validation philosophy: deliberately PERMISSIVE on both sides. Groq's
 * `response_format: json_schema` rejects responses that violate even
 * cosmetic constraints (additionalProperties:false, minLength), and the
 * 20B model occasionally invents extra fields or emits empty strings.
 * The JSON Schema mirrors here only specify the shape we *want*; Zod
 * defaults backfill missing fields and `.strip()` silently drops extras.
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────
// Agent 1 — Emotion Analyst
// ────────────────────────────────────────────────────────────────────────

const QUALITY_INTENSITIES = ["subtle", "moderate", "strong"] as const;

export const DetectedQuality = z.object({
  name: z.string().max(64).optional().default(""),
  direction: z.enum(["+", "-"]).optional().default("+"),
  intensity: z.enum(QUALITY_INTENSITIES).optional().default("moderate"),
  rationale: z.string().max(200).optional().default(""),
});

export const ExplicitTerm = z.object({
  term: z.string().max(64).optional().default(""),
  meaning: z.string().max(240).optional().default(""),
  photographic_translation: z.string().max(240).optional().default(""),
});

export const EmotionAnalysis = z.object({
  mood_description: z.string().max(320).optional().default(""),
  detected_qualities: z.array(DetectedQuality).max(8).optional().default([]),
  explicit_terms: z.array(ExplicitTerm).max(6).optional().default([]),
  caveats: z.array(z.string().max(200)).max(4).optional().default([]),
  summary: z.string().max(240).optional().default(""),
});

export type EmotionAnalysisT = z.infer<typeof EmotionAnalysis>;

// ────────────────────────────────────────────────────────────────────────
// Agent 2 — Image Mood Analyst
// ────────────────────────────────────────────────────────────────────────

export const NotableObservation = z.object({
  aspect: z.string().max(64).optional().default(""),
  finding: z.string().max(240).optional().default(""),
  implication: z.string().max(240).optional().default(""),
});

export const ModificationGuidance = z.object({
  safe_directions: z.array(z.string().max(200)).max(6).optional().default([]),
  risky_directions: z.array(z.string().max(200)).max(6).optional().default([]),
  notes: z.string().max(320).optional().default(""),
});

export const ImageMoodAnalysis = z.object({
  visual_personality: z.string().max(320).optional().default(""),
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
  summary: z.string().max(240).optional().default(""),
});

export type ImageMoodAnalysisT = z.infer<typeof ImageMoodAnalysis>;

// ────────────────────────────────────────────────────────────────────────
// JSON Schema mirrors for Groq `response_format: { type: "json_schema" }`.
// PERMISSIVE on purpose:
//   - no `required` arrays         (model may omit fields)
//   - no `additionalProperties:false` (model may invent fields, Zod strips)
//   - no `minLength: 1`              (empty string is OK)
// Length caps and enums are kept — those guide the model usefully.
// ────────────────────────────────────────────────────────────────────────

const strMax = (max: number) => ({
  type: "string" as const,
  maxLength: max,
});

const detectedQualityProps = {
  type: "object" as const,
  properties: {
    name: strMax(64),
    direction: { type: "string" as const, enum: ["+", "-"] },
    intensity: { type: "string" as const, enum: [...QUALITY_INTENSITIES] },
    rationale: strMax(200),
  },
};

const explicitTermProps = {
  type: "object" as const,
  properties: {
    term: strMax(64),
    meaning: strMax(240),
    photographic_translation: strMax(240),
  },
};

export const EMOTION_ANALYSIS_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    mood_description: strMax(320),
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
      items: strMax(200),
    },
    summary: strMax(240),
  },
};

const notableObservationProps = {
  type: "object" as const,
  properties: {
    aspect: strMax(64),
    finding: strMax(240),
    implication: strMax(240),
  },
};

const modificationGuidanceProps = {
  type: "object" as const,
  properties: {
    safe_directions: {
      type: "array" as const,
      maxItems: 6,
      items: strMax(200),
    },
    risky_directions: {
      type: "array" as const,
      maxItems: 6,
      items: strMax(200),
    },
    notes: strMax(320),
  },
};

export const IMAGE_MOOD_ANALYSIS_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    visual_personality: strMax(320),
    notable_observations: {
      type: "array" as const,
      maxItems: 6,
      items: notableObservationProps,
    },
    modification_guidance: modificationGuidanceProps,
    summary: strMax(240),
  },
};
