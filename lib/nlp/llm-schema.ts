/**
 * The contract between Groq's `gpt-oss-20b` and the editor.
 *
 * `LLMDelta` is the Zod schema we re-validate every model response with
 * (defence-in-depth — Groq's strict JSON-schema decoding already
 * guarantees structural conformance, but we still clamp ranges so a
 * "wow really dark" → exposure: -8 doesn't crash the shader).
 *
 * `LLM_JSON_SCHEMA` is the literal JSON Schema sent to Groq. The two are
 * hand-mirrored to keep the dep graph small (no zod-to-json-schema). If
 * you change one, change the other.
 *
 * `mergeDelta` applies a clamped delta to a cloned GradingParams.
 */
import { z } from "zod";
import {
  cloneParams,
  HUE_BANDS,
  type GradingParams,
  type HueBand,
} from "@/lib/grading/params";

// Without strict json_schema decoding (we now use json_object mode for the
// LLM-mode call to save ~262 input tokens), the model can occasionally
// emit out-of-range numbers. We accept anything numeric here and clamp in
// mergeDelta — ranges stay documented in the JSON Schema mirror below.
const num = () => z.number().optional();

const HslDeltaSchema = z
  .object({
    hue: num(),
    saturation: num(),
    luminance: num(),
  })
  .strict();

export const LLMDelta = z
  .object({
    temperature: num(),
    tint: num(),
    exposure: num(),
    contrast: num(),
    highlights: num(),
    shadows: num(),
    whites: num(),
    blacks: num(),
    vibrance: num(),
    saturation: num(),
    clarity: num(),
    hsl: z
      .object(
        Object.fromEntries(
          HUE_BANDS.map((b) => [b, HslDeltaSchema.optional()]),
        ) as Record<HueBand, z.ZodOptional<typeof HslDeltaSchema>>,
      )
      .strict()
      .optional(),
    splitToning: z
      .object({
        shadowHue: num(),
        shadowSaturation: num(),
        highlightHue: num(),
        highlightSaturation: num(),
        balance: num(),
      })
      .strict()
      .optional(),
    vignetteAmount: num(),
    reasoning: z.string().max(160).optional(),
  })
  .strict();

export type LLMDeltaT = z.infer<typeof LLMDelta>;

// ── JSON Schema mirror for Groq's strict mode. Keep in sync with LLMDelta. ──
const numProp = (min: number, max: number) => ({
  type: "number" as const,
  minimum: min,
  maximum: max,
});

const hslDeltaJsonSchema = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    hue: numProp(-100, 100),
    saturation: numProp(-100, 100),
    luminance: numProp(-100, 100),
  },
};

export const LLM_JSON_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    temperature: numProp(-100, 100),
    tint: numProp(-100, 100),
    exposure: numProp(-3, 3),
    contrast: numProp(-100, 100),
    highlights: numProp(-100, 100),
    shadows: numProp(-100, 100),
    whites: numProp(-100, 100),
    blacks: numProp(-100, 100),
    vibrance: numProp(-100, 100),
    saturation: numProp(-100, 100),
    clarity: numProp(-100, 100),
    hsl: {
      type: "object" as const,
      additionalProperties: false,
      properties: Object.fromEntries(
        HUE_BANDS.map((b) => [b, hslDeltaJsonSchema]),
      ),
    },
    splitToning: {
      type: "object" as const,
      additionalProperties: false,
      properties: {
        shadowHue: numProp(0, 360),
        shadowSaturation: numProp(0, 100),
        highlightHue: numProp(0, 360),
        highlightSaturation: numProp(0, 100),
        balance: numProp(-100, 100),
      },
    },
    vignetteAmount: numProp(-100, 100),
    reasoning: { type: "string", maxLength: 160 },
  },
};

// ── Apply ────────────────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Apply an LLM-produced delta on top of `current`. Every numeric value is
 * clamped against the same bounds as the slider UI; out-of-range values
 * from the model are nudged in rather than rejected, so a fuzzy "really
 * dark" with exposure: -8 still produces something sensible.
 *
 * The delta is treated as ABSOLUTE (replaces the current value), not
 * relative. The system prompt is written in those terms.
 */
export function mergeDelta(
  current: GradingParams,
  delta: LLMDeltaT,
): GradingParams {
  const out = cloneParams(current);

  if (delta.temperature !== undefined) out.temperature = clamp(delta.temperature, -100, 100);
  if (delta.tint !== undefined) out.tint = clamp(delta.tint, -100, 100);
  if (delta.exposure !== undefined) out.exposure = clamp(delta.exposure, -3, 3);
  if (delta.contrast !== undefined) out.contrast = clamp(delta.contrast, -100, 100);
  if (delta.highlights !== undefined) out.highlights = clamp(delta.highlights, -100, 100);
  if (delta.shadows !== undefined) out.shadows = clamp(delta.shadows, -100, 100);
  if (delta.whites !== undefined) out.whites = clamp(delta.whites, -100, 100);
  if (delta.blacks !== undefined) out.blacks = clamp(delta.blacks, -100, 100);
  if (delta.vibrance !== undefined) out.vibrance = clamp(delta.vibrance, -100, 100);
  if (delta.saturation !== undefined) out.saturation = clamp(delta.saturation, -100, 100);
  if (delta.clarity !== undefined) out.clarity = clamp(delta.clarity, -100, 100);
  if (delta.vignetteAmount !== undefined) {
    out.vignette = { ...out.vignette, amount: clamp(delta.vignetteAmount, -100, 100) };
  }

  if (delta.hsl) {
    for (const band of HUE_BANDS) {
      const d = delta.hsl[band];
      if (!d) continue;
      const cur = out.hsl[band];
      out.hsl[band] = {
        hue: d.hue !== undefined ? clamp(d.hue, -100, 100) : cur.hue,
        saturation: d.saturation !== undefined ? clamp(d.saturation, -100, 100) : cur.saturation,
        luminance: d.luminance !== undefined ? clamp(d.luminance, -100, 100) : cur.luminance,
      };
    }
  }

  if (delta.splitToning) {
    const s = delta.splitToning;
    out.splitToning = {
      shadowHue: s.shadowHue !== undefined ? clamp(s.shadowHue, 0, 360) : out.splitToning.shadowHue,
      shadowSaturation:
        s.shadowSaturation !== undefined ? clamp(s.shadowSaturation, 0, 100) : out.splitToning.shadowSaturation,
      highlightHue:
        s.highlightHue !== undefined ? clamp(s.highlightHue, 0, 360) : out.splitToning.highlightHue,
      highlightSaturation:
        s.highlightSaturation !== undefined
          ? clamp(s.highlightSaturation, 0, 100)
          : out.splitToning.highlightSaturation,
      balance: s.balance !== undefined ? clamp(s.balance, -100, 100) : out.splitToning.balance,
    };
  }

  return out;
}

/**
 * Did the model touch any field at all? (`reasoning` alone doesn't count
 * — we want to know whether to apply a delta.)
 */
export function hasDelta(d: LLMDeltaT): boolean {
  for (const k of Object.keys(d) as (keyof LLMDeltaT)[]) {
    if (k === "reasoning") continue;
    if (d[k] !== undefined) return true;
  }
  return false;
}
