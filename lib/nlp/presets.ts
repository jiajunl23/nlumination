/**
 * Curated presets that the NL parser can apply via the "preset" op kind.
 *
 * Each preset is a *partial* GradingParams — only the fields it cares about.
 * The compositor merges these on top of a base (default) params object,
 * preserving anything the preset doesn't touch and letting subsequent
 * delta/set ops layer on top.
 */

import {
  DEFAULT_PARAMS,
  cloneParams,
  type GradingParams,
  type HslBand,
} from "@/lib/grading/params";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export type Preset = {
  id: string;
  label: string;
  description: string;
  params: DeepPartial<GradingParams>;
};

const hsl = (overrides: Partial<HslBand>): HslBand => ({
  hue: 0,
  saturation: 0,
  luminance: 0,
  ...overrides,
});

export const PRESETS: Preset[] = [
  {
    id: "cinematic-teal-orange",
    label: "Cinematic",
    description: "Modern teal-orange split with controlled highlights.",
    params: {
      contrast: 18,
      highlights: -25,
      shadows: 18,
      blacks: -10,
      saturation: 8,
      vibrance: 12,
      temperature: -8,
      splitToning: {
        shadowHue: 195,
        shadowSaturation: 28,
        highlightHue: 28,
        highlightSaturation: 22,
        balance: 0,
      },
      hsl: {
        ...DEFAULT_PARAMS.hsl,
        orange: hsl({ saturation: 14 }),
        blue: hsl({ saturation: 12, luminance: -8 }),
      },
    },
  },
  {
    id: "film-emulation",
    label: "Film",
    description: "Faded blacks, soft highlights, gently warm midtones.",
    params: {
      contrast: -8,
      highlights: -12,
      shadows: 14,
      blacks: 18,
      whites: -6,
      saturation: -6,
      vibrance: 10,
      temperature: 6,
      tint: 4,
      splitToning: {
        shadowHue: 30,
        shadowSaturation: 12,
        highlightHue: 50,
        highlightSaturation: 10,
        balance: -10,
      },
      curve: {
        points: [
          { x: 0, y: 0.06 },
          { x: 0.25, y: 0.22 },
          { x: 0.75, y: 0.78 },
          { x: 1, y: 0.94 },
        ],
      },
      hsl: {
        ...DEFAULT_PARAMS.hsl,
        orange: hsl({ saturation: 8, luminance: 4 }),
        green: hsl({ saturation: -6, luminance: 4 }),
        yellow: hsl({ saturation: 6 }),
      },
    },
  },
  {
    id: "vintage-fade",
    label: "Vintage",
    description: "Washed-out blacks, sepia midtones, low contrast.",
    params: {
      contrast: -18,
      highlights: -8,
      shadows: 8,
      blacks: 28,
      saturation: -18,
      vibrance: 6,
      temperature: 14,
      tint: -4,
      splitToning: {
        shadowHue: 30,
        shadowSaturation: 22,
        highlightHue: 50,
        highlightSaturation: 16,
        balance: 0,
      },
      hsl: {
        ...DEFAULT_PARAMS.hsl,
        red: hsl({ saturation: -10 }),
        orange: hsl({ saturation: -6, luminance: 6 }),
      },
      vignette: { amount: -15, midpoint: 50, feather: 60 },
    },
  },
  {
    id: "bright-airy",
    label: "Bright & Airy",
    description: "Light, soft, slightly warm — Instagram lifestyle look.",
    params: {
      exposure: 0.25,
      contrast: -10,
      highlights: 8,
      shadows: 22,
      whites: 8,
      blacks: 14,
      saturation: -4,
      vibrance: 18,
      temperature: 8,
      curve: {
        points: [
          { x: 0, y: 0.04 },
          { x: 0.3, y: 0.34 },
          { x: 0.75, y: 0.8 },
          { x: 1, y: 1 },
        ],
      },
      hsl: {
        ...DEFAULT_PARAMS.hsl,
        orange: hsl({ saturation: 6, luminance: 8 }),
        green: hsl({ saturation: -10, luminance: 8 }),
      },
    },
  },
  {
    id: "moody",
    label: "Moody",
    description: "Brooding contrast, deep shadows, low saturation.",
    params: {
      exposure: -0.2,
      contrast: 20,
      highlights: -25,
      shadows: -10,
      whites: -10,
      blacks: -22,
      saturation: -15,
      vibrance: 8,
      temperature: -10,
      splitToning: {
        shadowHue: 220,
        shadowSaturation: 18,
        highlightHue: 35,
        highlightSaturation: 8,
        balance: -10,
      },
      hsl: {
        ...DEFAULT_PARAMS.hsl,
        green: hsl({ saturation: -16, luminance: -8 }),
        blue: hsl({ saturation: 10, luminance: -10 }),
      },
      vignette: { amount: -22, midpoint: 50, feather: 55 },
    },
  },
  {
    id: "morning-mist",
    label: "Morning Mist",
    description: "Soft, misty, low contrast with blue cast.",
    params: {
      exposure: 0.15,
      contrast: -22,
      highlights: -6,
      shadows: 30,
      whites: 6,
      blacks: 22,
      saturation: -16,
      vibrance: 6,
      temperature: -16,
      tint: 6,
      splitToning: {
        shadowHue: 200,
        shadowSaturation: 20,
        highlightHue: 220,
        highlightSaturation: 8,
        balance: 0,
      },
      hsl: {
        ...DEFAULT_PARAMS.hsl,
        green: hsl({ saturation: -16, luminance: 6 }),
        blue: hsl({ luminance: 8 }),
      },
    },
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    description: "Magenta highlights, electric blues, hard contrast.",
    params: {
      exposure: -0.1,
      contrast: 32,
      highlights: -15,
      shadows: -8,
      blacks: -18,
      saturation: 24,
      vibrance: 10,
      temperature: -22,
      tint: 18,
      splitToning: {
        shadowHue: 220,
        shadowSaturation: 36,
        highlightHue: 320,
        highlightSaturation: 32,
        balance: 0,
      },
      hsl: {
        ...DEFAULT_PARAMS.hsl,
        red: hsl({ hue: -10, saturation: 18 }),
        magenta: hsl({ saturation: 30, luminance: 6 }),
        blue: hsl({ saturation: 28 }),
        purple: hsl({ saturation: 24 }),
      },
      vignette: { amount: -28, midpoint: 45, feather: 55 },
    },
  },
  {
    id: "golden-hour",
    label: "Golden Hour",
    description: "Warm sunset glow with deep amber highlights.",
    params: {
      exposure: 0.1,
      contrast: 8,
      highlights: -8,
      shadows: 12,
      blacks: -8,
      saturation: 6,
      vibrance: 18,
      temperature: 28,
      tint: 6,
      splitToning: {
        shadowHue: 20,
        shadowSaturation: 14,
        highlightHue: 35,
        highlightSaturation: 26,
        balance: 10,
      },
      hsl: {
        ...DEFAULT_PARAMS.hsl,
        orange: hsl({ saturation: 22, luminance: 6 }),
        yellow: hsl({ saturation: 18, luminance: 4 }),
        red: hsl({ saturation: 14 }),
      },
    },
  },
];

export const PRESETS_BY_ID: Record<string, Preset> = Object.fromEntries(
  PRESETS.map((p) => [p.id, p]),
);

export function paramsFromPreset(presetId: string): GradingParams {
  const preset = PRESETS_BY_ID[presetId];
  if (!preset) return cloneParams(DEFAULT_PARAMS);
  return mergeParams(cloneParams(DEFAULT_PARAMS), preset.params);
}

export function mergeParams(
  base: GradingParams,
  patch: DeepPartial<GradingParams>,
): GradingParams {
  const out = cloneParams(base);
  for (const k of Object.keys(patch) as (keyof GradingParams)[]) {
    const v = patch[k];
    if (v === undefined) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      // Deep merge for nested objects (hsl, splitToning, vignette, curve).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[k] = { ...(base as any)[k], ...(v as any) };
      // Special-case nested HSL bands so each band still merges.
      if (k === "hsl") {
        const merged: GradingParams["hsl"] = { ...base.hsl };
        for (const band of Object.keys(v) as (keyof GradingParams["hsl"])[]) {
          merged[band] = { ...base.hsl[band], ...(v as DeepPartial<GradingParams["hsl"]>)[band] };
        }
        out.hsl = merged;
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[k] = v;
    }
  }
  return out;
}
