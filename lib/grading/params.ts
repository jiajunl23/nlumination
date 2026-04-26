/**
 * GradingParams — the single source of truth.
 *
 * Read by: WebGL pipeline (translated to uniforms), slider UI, NL parser.
 * Written by: slider UI, NL parser, presets, gallery (via DB jsonb).
 *
 * All values live on bounded numeric ranges so the UI can render sliders
 * mechanically and the shader can clamp without surprise.
 */

export const HUE_BANDS = [
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
  "magenta",
] as const;
export type HueBand = (typeof HUE_BANDS)[number];

/** Center hue (degrees, 0..360) used by the HSL pass for each band. */
export const HUE_BAND_CENTERS: Record<HueBand, number> = {
  red: 0,
  orange: 30,
  yellow: 60,
  green: 120,
  aqua: 180,
  blue: 240,
  purple: 280,
  magenta: 320,
};

export type HslBand = {
  /** -100..+100 hue rotation in this band, in degrees scaled by ±30°. */
  hue: number;
  /** -100..+100 saturation shift in this band. */
  saturation: number;
  /** -100..+100 luminance shift in this band. */
  luminance: number;
};

/** A point on the master tone curve, both in 0..1 input/output. */
export type CurvePoint = { x: number; y: number };

export type GradingParams = {
  // ── White balance (corrective) ────────────────────────────────
  /** -100..+100, mapped to ~±2500 K shift around the image's neutral. */
  temperature: number;
  /** -100..+100, green↔magenta. */
  tint: number;

  // ── Light ─────────────────────────────────────────────────────
  /** -3..+3 stops, multiplicative in linear light. */
  exposure: number;
  /** -100..+100, S-curve around mid grey. */
  contrast: number;
  /** -100..+100, recover/push the upper third of the tone range. */
  highlights: number;
  /** -100..+100, recover/push the lower third. */
  shadows: number;
  /** -100..+100, where pure-white clipping starts. */
  whites: number;
  /** -100..+100, where pure-black crushing starts. */
  blacks: number;

  // ── Presence ──────────────────────────────────────────────────
  /** -100..+100, saturation that protects already-saturated colors and skin. */
  vibrance: number;
  /** -100..+100, global saturation. */
  saturation: number;
  /** -100..+100, local-contrast pop via box-blur diff. */
  clarity: number;

  // ── HSL per-channel ───────────────────────────────────────────
  hsl: Record<HueBand, HslBand>;

  // ── Master tone curve ─────────────────────────────────────────
  /** 4-point curve, x and y both in 0..1. Endpoints fixed at (0,0) & (1,1). */
  curve: { points: CurvePoint[] };

  // ── Split toning / color grading ──────────────────────────────
  splitToning: {
    /** 0..360 */
    shadowHue: number;
    /** 0..100 */
    shadowSaturation: number;
    /** 0..360 */
    highlightHue: number;
    /** 0..100 */
    highlightSaturation: number;
    /** -100..+100, biases where shadow vs highlight tint dominates. */
    balance: number;
  };

  // ── Vignette ──────────────────────────────────────────────────
  vignette: {
    /** -100..+100. Negative darkens corners, positive lightens. */
    amount: number;
    /** 0..100, where the vignette starts to fall in (smaller = larger center). */
    midpoint: number;
    /** 0..100, edge softness. */
    feather: number;
  };

  // ── Optional 3D LUT look layer ────────────────────────────────
  /** ID of a bundled LUT in /public/luts (filename without .cube), or null. */
  lutId: string | null;
  /** 0..1, blend amount for the LUT pass. */
  lutOpacity: number;
};

const zeroBand = (): HslBand => ({ hue: 0, saturation: 0, luminance: 0 });

export const DEFAULT_PARAMS: GradingParams = {
  temperature: 0,
  tint: 0,

  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,

  vibrance: 0,
  saturation: 0,
  clarity: 0,

  hsl: {
    red: zeroBand(),
    orange: zeroBand(),
    yellow: zeroBand(),
    green: zeroBand(),
    aqua: zeroBand(),
    blue: zeroBand(),
    purple: zeroBand(),
    magenta: zeroBand(),
  },

  curve: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },

  splitToning: {
    shadowHue: 220,
    shadowSaturation: 0,
    highlightHue: 40,
    highlightSaturation: 0,
    balance: 0,
  },

  vignette: { amount: 0, midpoint: 50, feather: 50 },

  lutId: null,
  lutOpacity: 1,
};

/** Clone for safe mutation. */
export function cloneParams(p: GradingParams): GradingParams {
  return {
    ...p,
    hsl: Object.fromEntries(
      Object.entries(p.hsl).map(([k, v]) => [k, { ...v }]),
    ) as Record<HueBand, HslBand>,
    curve: { points: p.curve.points.map((pt) => ({ ...pt })) },
    splitToning: { ...p.splitToning },
    vignette: { ...p.vignette },
  };
}

/** Bounds for slider UI and parser clamping. */
export const PARAM_RANGES = {
  temperature: [-100, 100],
  tint: [-100, 100],
  exposure: [-3, 3],
  contrast: [-100, 100],
  highlights: [-100, 100],
  shadows: [-100, 100],
  whites: [-100, 100],
  blacks: [-100, 100],
  vibrance: [-100, 100],
  saturation: [-100, 100],
  clarity: [-100, 100],
  hslHue: [-100, 100],
  hslSaturation: [-100, 100],
  hslLuminance: [-100, 100],
  splitHue: [0, 360],
  splitSat: [0, 100],
  balance: [-100, 100],
  vignetteAmount: [-100, 100],
  vignetteMidpoint: [0, 100],
  vignetteFeather: [0, 100],
  lutOpacity: [0, 1],
} as const;
