/**
 * Translate a `GradingParams` into the actual numbers / arrays the shader
 * consumes. Keeps the GLSL free of "what scale was this slider on again?"
 * questions and centralises normalisation.
 */

import { HUE_BANDS, type GradingParams } from "./params";

export type GradingUniforms = {
  temperature: number;
  tint: number;
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  vibrance: number;
  saturation: number;
  clarity: number;
  hslHue: Float32Array;       // length 8
  hslSat: Float32Array;       // length 8
  hslLum: Float32Array;       // length 8
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
  splitBalance: number;
  vignetteAmount: number;
  vignetteMidpoint: number;   // 0..1
  vignetteFeather: number;    // 0..1
  lutOpacity: number;
};

const N100 = 1 / 100;

export function paramsToUniforms(p: GradingParams): GradingUniforms {
  const hslHue = new Float32Array(8);
  const hslSat = new Float32Array(8);
  const hslLum = new Float32Array(8);
  for (let i = 0; i < HUE_BANDS.length; i++) {
    const band = p.hsl[HUE_BANDS[i]];
    hslHue[i] = band.hue * N100;
    hslSat[i] = band.saturation * N100;
    hslLum[i] = band.luminance * N100;
  }

  return {
    temperature: p.temperature * N100,
    tint: p.tint * N100,
    exposure: p.exposure,
    contrast: p.contrast * N100,
    highlights: p.highlights * N100,
    shadows: p.shadows * N100,
    whites: p.whites * N100,
    blacks: p.blacks * N100,
    vibrance: p.vibrance * N100,
    saturation: p.saturation * N100,
    clarity: p.clarity * N100,
    hslHue,
    hslSat,
    hslLum,
    // v=sat so a saturation of 0 yields (0,0,0) and the shader's length(tint)
    // gate folds split-toning to identity. Otherwise hsvToRgb(_, 0, 1) returns
    // pure white and floods the whole image with a 50%-grey tint.
    shadowTint: hsvToRgb(
      p.splitToning.shadowHue / 360,
      p.splitToning.shadowSaturation * N100,
      p.splitToning.shadowSaturation * N100,
    ),
    highlightTint: hsvToRgb(
      p.splitToning.highlightHue / 360,
      p.splitToning.highlightSaturation * N100,
      p.splitToning.highlightSaturation * N100,
    ),
    splitBalance: p.splitToning.balance * N100,
    vignetteAmount: p.vignette.amount * N100,
    vignetteMidpoint: 0.4 + (1 - p.vignette.midpoint * N100) * 0.6,
    vignetteFeather: p.vignette.feather * N100 * 0.6,
    lutOpacity: p.lutOpacity,
  };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}
