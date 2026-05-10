/**
 * Eval set for the agents pipeline (A1‖A2 → A3).
 *
 * Goal: catch how often A3's delta is "professional" — i.e. lands within
 * the bounded ranges a colorist would consider plausible for a given prompt.
 *
 * Three categories:
 *   • literal   — single-axis prompt; magnitude must land in expected range,
 *                 unrelated params must NOT shift (over-correction guard)
 *   • stylistic — compound look (cinematic, vintage, …); multiple fields
 *                 must move in coordinated directions
 *   • chain     — refinement after 1–2 prior turns; A3 must respect the
 *                 directional cue ("less X", "actually warmer") relative to
 *                 the post-history state
 *
 * Each case ships its own grader so the runner has no schema-driving logic.
 * Range tuples are written as [low, high] inclusive.
 *
 * The image fixture is intentionally fixed (dim, slightly warm) so the eval
 * isolates prompt+history response from per-image variance.
 */
import {
  DEFAULT_PARAMS,
  type GradingParams,
} from "@/lib/grading/params";
import { mergeDelta, type LLMDeltaT } from "@/lib/nlp/llm-schema";
import type { ImageStats } from "@/lib/grading/imageStats";
import type { TurnRecord } from "@/lib/nlp/agent/state";

export const FIXTURE_STATS: ImageStats = {
  meanLuminance: 0.17,
  stdLuminance: 0.16,
  meanR: 0.18,
  meanG: 0.16,
  meanB: 0.14,
  p05Luminance: 0.02,
  p95Luminance: 0.54,
};

export type GraderResult = { passed: boolean; fails: string[] };

export type EvalCase = {
  id: string;
  category: "literal" | "stylistic" | "chain";
  prompt: string;
  /** Optional history of prior turns (chain cases only). */
  history?: TurnRecord[];
  grade: (delta: LLMDeltaT, paramsAfter: GradingParams) => GraderResult;
  /**
   * For stylistic / chain cases that *can* be solved by a LUT seed:
   * if A3 picks a LUT whose tags overlap with this list, the original
   * slider-strict grader is bypassed (LUT itself encodes the look —
   * sliders missing temperature/saturation/etc is no longer a fail).
   * Empty / undefined = LUT path not credited (use original grader only).
   *
   * The check is still gated by `forbidden` slider ranges below to catch
   * over-correction even on LUT-credited cases.
   */
  acceptableLutTags?: string[];
};

// ── grader helpers ─────────────────────────────────────────────────────

type Range = [number, number];

const inRange = (
  v: number | undefined,
  [lo, hi]: Range,
  name: string,
): string | null => {
  if (v === undefined) return `${name} missing (expected in [${lo},${hi}])`;
  if (v < lo || v > hi) return `${name}=${v} out of [${lo},${hi}]`;
  return null;
};

const notExceed = (
  v: number | undefined,
  [lo, hi]: Range,
  name: string,
): string | null => {
  if (v === undefined) return null;
  if (v < lo || v > hi) return `${name}=${v} OVERSHOT [${lo},${hi}]`;
  return null;
};

const atLeastOneOf = (
  pairs: { value: number | undefined; min: number; name: string }[],
  label: string,
): string | null => {
  const hit = pairs.some((p) => p.value !== undefined && p.value >= p.min);
  if (hit) return null;
  return `${label}: none of [${pairs
    .map((p) => `${p.name}≥${p.min}`)
    .join(", ")}]`;
};

const check = (checks: (string | null)[]): GraderResult => {
  const fails = checks.filter((s): s is string => s !== null);
  return { passed: fails.length === 0, fails };
};

// Build a compact TurnRecord history from a list of (prompt, delta) pairs.
// paramsAfter is computed via mergeDelta so the final state is realistic.
const buildHistory = (
  turns: { prompt: string; delta: LLMDeltaT }[],
): { history: TurnRecord[]; finalParams: GradingParams } => {
  const out: TurnRecord[] = [];
  let params = DEFAULT_PARAMS;
  for (const t of turns) {
    const after = mergeDelta(params, t.delta);
    out.push({
      prompt: t.prompt,
      paramsBefore: params,
      delta: t.delta,
      paramsAfter: after,
      timestamp: Date.now(),
    });
    params = after;
  }
  return { history: out, finalParams: params };
};

// ── cases ──────────────────────────────────────────────────────────────

const literalCases: EvalCase[] = [
  {
    id: "L01",
    category: "literal",
    prompt: "warmer",
    grade: (d) =>
      check([
        inRange(d.temperature, [8, 25], "temperature"),
        notExceed(d.contrast, [-8, 8], "contrast"),
        notExceed(d.exposure, [-0.15, 0.15], "exposure"),
      ]),
  },
  {
    id: "L02",
    category: "literal",
    prompt: "cooler",
    grade: (d) =>
      check([
        inRange(d.temperature, [-25, -8], "temperature"),
        notExceed(d.contrast, [-8, 8], "contrast"),
        notExceed(d.exposure, [-0.15, 0.15], "exposure"),
      ]),
  },
  {
    id: "L03",
    category: "literal",
    prompt: "more contrast",
    grade: (d) =>
      check([
        inRange(d.contrast, [10, 35], "contrast"),
        notExceed(d.temperature, [-8, 8], "temperature"),
        notExceed(d.saturation, [-8, 8], "saturation"),
      ]),
  },
  {
    id: "L04",
    category: "literal",
    prompt: "less contrast",
    grade: (d) =>
      check([
        inRange(d.contrast, [-35, -10], "contrast"),
        notExceed(d.temperature, [-8, 8], "temperature"),
      ]),
  },
  {
    id: "L05",
    category: "literal",
    prompt: "brighter",
    grade: (d) =>
      check([
        atLeastOneOf(
          [
            { value: d.exposure, min: 0.05, name: "exposure" },
            { value: d.shadows, min: 8, name: "shadows" },
          ],
          "no brightening signal",
        ),
        notExceed(d.temperature, [-8, 8], "temperature"),
      ]),
  },
  {
    id: "L06",
    category: "literal",
    prompt: "darker",
    grade: (d) =>
      check([
        atLeastOneOf(
          [
            { value: d.exposure !== undefined ? -d.exposure : undefined, min: 0.05, name: "-exposure" },
            { value: d.shadows !== undefined ? -d.shadows : undefined, min: 8, name: "-shadows" },
          ],
          "no darkening signal",
        ),
        notExceed(d.temperature, [-8, 8], "temperature"),
      ]),
  },
  {
    id: "L07",
    category: "literal",
    prompt: "more saturated",
    grade: (d) =>
      check([
        atLeastOneOf(
          [
            { value: d.saturation, min: 8, name: "saturation" },
            { value: d.vibrance, min: 8, name: "vibrance" },
          ],
          "no saturation signal",
        ),
        notExceed(d.contrast, [-8, 8], "contrast"),
      ]),
  },
  {
    id: "L08",
    category: "literal",
    prompt: "lift the shadows",
    grade: (d) =>
      check([
        inRange(d.shadows, [10, 40], "shadows"),
        notExceed(d.contrast, [-8, 8], "contrast"),
      ]),
  },
  {
    id: "L09",
    category: "literal",
    prompt: "recover the highlights",
    grade: (d) =>
      check([
        inRange(d.highlights, [-45, -10], "highlights"),
        notExceed(d.contrast, [-8, 8], "contrast"),
      ]),
  },
  {
    id: "L10",
    category: "literal",
    prompt: "more vibrance",
    grade: (d) =>
      check([
        inRange(d.vibrance, [8, 30], "vibrance"),
        notExceed(d.contrast, [-8, 8], "contrast"),
      ]),
  },
];

const stylisticCases: EvalCase[] = [
  {
    id: "S01",
    category: "stylistic",
    prompt: "make it cinematic",
    acceptableLutTags: ["cinematic", "bleach-bypass", "blockbuster", "teal", "complementary"],
    grade: (d) =>
      check([
        inRange(d.contrast, [8, 40], "contrast"),
        inRange(d.shadows, [-5, 35], "shadows"),
        atLeastOneOf(
          [
            { value: d.splitToning?.shadowSaturation, min: 5, name: "split.shadowSat" },
            { value: d.splitToning?.highlightSaturation, min: 5, name: "split.highlightSat" },
            { value: d.hsl?.orange?.saturation, min: 5, name: "hsl.orange.sat" },
            { value: d.hsl?.aqua?.saturation, min: 5, name: "hsl.aqua.sat" },
          ],
          "cinematic missing color treatment",
        ),
      ]),
  },
  {
    id: "S02",
    category: "stylistic",
    prompt: "moody and contemplative",
    acceptableLutTags: ["moody", "muted", "atmospheric", "fog", "night", "low-light", "blue"],
    grade: (d) =>
      check([
        inRange(d.saturation ?? 0, [-35, 0], "saturation"),
        // moody usually pushes either contrast up or shadows down (or both)
        atLeastOneOf(
          [
            { value: d.contrast, min: 5, name: "contrast" },
            { value: d.shadows !== undefined ? -d.shadows : undefined, min: 5, name: "-shadows" },
            { value: d.exposure !== undefined ? -d.exposure : undefined, min: 0.1, name: "-exposure" },
          ],
          "moody lacks darkening cue",
        ),
      ]),
  },
  {
    id: "S03",
    category: "stylistic",
    prompt: "warm sunset golden hour",
    acceptableLutTags: ["golden-hour", "amber", "sunset", "candlelight", "warm"],
    grade: (d) =>
      check([
        inRange(d.temperature, [10, 30], "temperature"),
        atLeastOneOf(
          [
            { value: d.hsl?.orange?.saturation, min: 5, name: "hsl.orange.sat" },
            { value: d.hsl?.yellow?.saturation, min: 5, name: "hsl.yellow.sat" },
            {
              value:
                d.splitToning?.highlightHue !== undefined &&
                d.splitToning.highlightHue >= 15 &&
                d.splitToning.highlightHue <= 60
                  ? d.splitToning.highlightSaturation ?? 0
                  : undefined,
              min: 5,
              name: "split.highlight (warm)",
            },
          ],
          "no golden-hour color treatment",
        ),
      ]),
  },
  {
    id: "S04",
    category: "stylistic",
    prompt: "cold nordic landscape",
    acceptableLutTags: ["cool", "icy", "nordic", "winter", "blue"],
    grade: (d) =>
      check([
        inRange(d.temperature, [-30, -5], "temperature"),
        inRange(d.saturation ?? 0, [-30, 5], "saturation"),
      ]),
  },
  {
    id: "S05",
    category: "stylistic",
    prompt: "vintage faded film",
    acceptableLutTags: ["vintage", "lo-fi", "polaroid", "instant", "lomography", "redscale"],
    grade: (d) =>
      check([
        inRange(d.saturation ?? 0, [-35, -3], "saturation"),
        // lifted blacks (positive blacks) is the canonical vintage signature
        atLeastOneOf(
          [
            { value: d.blacks, min: 5, name: "blacks" },
            { value: d.shadows, min: 8, name: "shadows" },
          ],
          "vintage missing lifted-blacks cue",
        ),
      ]),
  },
  {
    id: "S06",
    category: "stylistic",
    prompt: "high-key bright and airy",
    // No `acceptableLutTags` — high-key is a tonal regime (exposure +,
    // shadows +, contrast −), not a color identity. LUTs that *also*
    // brighten don't exist in the bundle, so insist on slider deltas.
    grade: (d) =>
      check([
        atLeastOneOf(
          [
            { value: d.exposure, min: 0.05, name: "exposure" },
            { value: d.shadows, min: 8, name: "shadows" },
          ],
          "high-key missing brightening cue",
        ),
        inRange(d.saturation ?? 0, [-25, 8], "saturation"),
      ]),
  },
  {
    id: "S07",
    category: "stylistic",
    prompt: "punchy and dramatic",
    acceptableLutTags: ["high-contrast", "dramatic", "ember", "bleach-bypass", "blockbuster"],
    grade: (d) =>
      check([
        inRange(d.contrast, [12, 45], "contrast"),
        atLeastOneOf(
          [
            { value: d.clarity, min: 5, name: "clarity" },
            { value: d.saturation, min: 5, name: "saturation" },
            { value: d.vibrance, min: 5, name: "vibrance" },
          ],
          "punchy missing presence boost",
        ),
      ]),
  },
  {
    id: "S08",
    category: "stylistic",
    prompt: "soft dreamy pastel",
    acceptableLutTags: ["soft", "subtle", "muted", "gentle"],
    grade: (d) =>
      check([
        inRange(d.contrast ?? 0, [-35, 0], "contrast"),
        inRange(d.saturation ?? 0, [-30, 5], "saturation"),
      ]),
  },
  {
    id: "S09",
    category: "stylistic",
    prompt: "teal and orange",
    acceptableLutTags: ["teal", "orange", "blockbuster", "cinematic", "complementary"],
    grade: (d) => {
      // Either splitToning gets the canonical colors, OR hsl bands fake it.
      const splitOk =
        d.splitToning?.shadowHue !== undefined &&
        d.splitToning.shadowHue >= 175 &&
        d.splitToning.shadowHue <= 220 &&
        (d.splitToning.shadowSaturation ?? 0) >= 5 &&
        d.splitToning.highlightHue !== undefined &&
        d.splitToning.highlightHue >= 15 &&
        d.splitToning.highlightHue <= 50 &&
        (d.splitToning.highlightSaturation ?? 0) >= 5;
      const hslOk =
        (d.hsl?.aqua?.saturation ?? 0) >= 5 &&
        (d.hsl?.orange?.saturation ?? 0) >= 5;
      if (splitOk || hslOk) return { passed: true, fails: [] };
      return {
        passed: false,
        fails: [
          `teal-orange not encoded in splitToning {shadow≈200, highlight≈30} or hsl{aqua,orange}.sat (got split=${JSON.stringify(d.splitToning ?? {})}, hsl.aqua.sat=${d.hsl?.aqua?.saturation}, hsl.orange.sat=${d.hsl?.orange?.saturation})`,
        ],
      };
    },
  },
  {
    id: "S10",
    category: "stylistic",
    prompt: "noir black and white feel",
    acceptableLutTags: ["black-and-white", "monochrome", "noir", "dark"],
    grade: (d) =>
      check([
        inRange(d.saturation, [-100, -50], "saturation"),
        inRange(d.contrast ?? 0, [5, 50], "contrast"),
      ]),
  },
  {
    id: "S11",
    category: "stylistic",
    prompt: "lush green forest, deeper greens",
    // No `acceptableLutTags` — "deeper greens" is HSL.green-specific;
    // no LUT in the bundle targets greens exclusively. Sliders only.
    grade: (d) =>
      check([
        atLeastOneOf(
          [
            { value: d.hsl?.green?.saturation, min: 5, name: "hsl.green.sat" },
            { value: d.hsl?.green?.luminance !== undefined ? -d.hsl.green.luminance : undefined, min: 0, name: "-hsl.green.lum" },
          ],
          "no green-band treatment",
        ),
      ]),
  },
  {
    id: "S12",
    category: "stylistic",
    prompt: "subtle warmth, very gentle, barely noticeable",
    acceptableLutTags: ["warm", "soft", "subtle", "gentle"],
    grade: (d) =>
      check([
        inRange(d.temperature, [2, 12], "temperature"),
        // over-correction guard: with "barely noticeable", no other big move.
        notExceed(d.contrast, [-10, 10], "contrast"),
        notExceed(d.saturation, [-10, 10], "saturation"),
        notExceed(d.exposure, [-0.2, 0.2], "exposure"),
        notExceed(d.shadows, [-10, 10], "shadows"),
      ]),
  },
];

// ── chain cases ────────────────────────────────────────────────────────

const chainC01 = buildHistory([
  { prompt: "warmer", delta: { temperature: 15, reasoning: "warmer" } },
  { prompt: "more contrast", delta: { contrast: 22, reasoning: "more contrast" } },
]);
const chainC02 = buildHistory([
  {
    prompt: "make it cinematic",
    delta: {
      contrast: 25,
      shadows: 22,
      temperature: 12,
      saturation: -5,
      vibrance: 10,
      splitToning: {
        shadowHue: 210,
        shadowSaturation: 18,
        highlightHue: 30,
        highlightSaturation: 12,
        balance: -8,
      },
      reasoning: "cinematic teal-orange",
    },
  },
]);
const chainC03 = buildHistory([
  { prompt: "make it warm", delta: { temperature: 22, tint: 4, reasoning: "warm" } },
]);
const chainC04 = buildHistory([
  { prompt: "darker", delta: { exposure: -0.4, blacks: -8, reasoning: "darker" } },
]);
const chainC05 = buildHistory([
  { prompt: "desaturated muted look", delta: { saturation: -35, vibrance: -10, reasoning: "muted" } },
  { prompt: "more cinematic", delta: { contrast: 18, shadows: 15, saturation: -8, reasoning: "cinematic-ish" } },
]);
const chainC06 = buildHistory([
  { prompt: "cool", delta: { temperature: -18, reasoning: "cool" } },
  { prompt: "more contrast", delta: { contrast: 25, reasoning: "contrast" } },
]);
const chainC07 = buildHistory([
  { prompt: "high contrast", delta: { contrast: 35, clarity: 10, reasoning: "high contrast" } },
]);
const chainC08 = buildHistory([
  {
    prompt: "teal and orange",
    delta: {
      splitToning: {
        shadowHue: 200,
        shadowSaturation: 35,
        highlightHue: 30,
        highlightSaturation: 25,
        balance: -10,
      },
      reasoning: "teal-orange",
    },
  },
]);

const chainCases: EvalCase[] = [
  {
    id: "C01",
    category: "chain",
    prompt: "actually that's too much, dial it back",
    history: chainC01.history,
    grade: (d) => {
      // Expect at least one of the just-pushed knobs to reverse meaningfully.
      const tempReversed =
        d.temperature !== undefined && d.temperature < chainC01.finalParams.temperature - 4;
      const contrastReversed =
        d.contrast !== undefined && d.contrast < chainC01.finalParams.contrast - 4;
      if (tempReversed || contrastReversed) return { passed: true, fails: [] };
      return {
        passed: false,
        fails: [
          `no reversal: prevParams temp=${chainC01.finalParams.temperature}, contrast=${chainC01.finalParams.contrast}; delta temp=${d.temperature}, contrast=${d.contrast}`,
        ],
      };
    },
  },
  {
    id: "C02",
    category: "chain",
    prompt: "less dramatic",
    history: chainC02.history,
    grade: (d) => {
      const ok =
        d.contrast !== undefined && d.contrast < chainC02.finalParams.contrast - 5;
      if (ok) return { passed: true, fails: [] };
      return {
        passed: false,
        fails: [
          `contrast=${d.contrast} not lower than prior ${chainC02.finalParams.contrast}`,
        ],
      };
    },
  },
  {
    id: "C03",
    category: "chain",
    prompt: "less warm",
    history: chainC03.history,
    grade: (d) => {
      const ok =
        d.temperature !== undefined &&
        d.temperature < chainC03.finalParams.temperature - 5;
      if (ok) return { passed: true, fails: [] };
      return {
        passed: false,
        fails: [
          `temperature=${d.temperature} not lower than prior ${chainC03.finalParams.temperature}`,
        ],
      };
    },
  },
  {
    id: "C04",
    category: "chain",
    prompt: "actually a touch brighter",
    history: chainC04.history,
    grade: (d) => {
      const ok =
        d.exposure !== undefined &&
        d.exposure > chainC04.finalParams.exposure + 0.1;
      if (ok) return { passed: true, fails: [] };
      return {
        passed: false,
        fails: [
          `exposure=${d.exposure} not higher than prior ${chainC04.finalParams.exposure}`,
        ],
      };
    },
  },
  {
    id: "C05",
    category: "chain",
    prompt: "bring back some color",
    history: chainC05.history,
    grade: (d) => {
      const ok =
        (d.saturation !== undefined &&
          d.saturation > chainC05.finalParams.saturation + 5) ||
        (d.vibrance !== undefined &&
          d.vibrance > chainC05.finalParams.vibrance + 5);
      if (ok) return { passed: true, fails: [] };
      return {
        passed: false,
        fails: [
          `no saturation rise: prior sat=${chainC05.finalParams.saturation}, vib=${chainC05.finalParams.vibrance}; delta sat=${d.saturation}, vib=${d.vibrance}`,
        ],
      };
    },
  },
  {
    id: "C06",
    category: "chain",
    prompt: "warmer but keep the contrast",
    history: chainC06.history,
    grade: (d) => {
      const tempUp =
        d.temperature !== undefined &&
        d.temperature > chainC06.finalParams.temperature + 5;
      const contrastSteady =
        d.contrast === undefined ||
        Math.abs(d.contrast - chainC06.finalParams.contrast) <= 8;
      const fails: string[] = [];
      if (!tempUp)
        fails.push(
          `temperature=${d.temperature} not higher than prior ${chainC06.finalParams.temperature}`,
        );
      if (!contrastSteady)
        fails.push(
          `contrast=${d.contrast} drifted from prior ${chainC06.finalParams.contrast} by >8`,
        );
      return { passed: fails.length === 0, fails };
    },
  },
  {
    id: "C07",
    category: "chain",
    prompt: "undo the last change",
    history: chainC07.history,
    grade: (d) => {
      // After a +35 contrast turn, "undo" should drop contrast meaningfully.
      const ok =
        d.contrast !== undefined && d.contrast < chainC07.finalParams.contrast - 15;
      if (ok) return { passed: true, fails: [] };
      return {
        passed: false,
        fails: [
          `contrast=${d.contrast} not undone (prior ${chainC07.finalParams.contrast})`,
        ],
      };
    },
  },
  {
    id: "C08",
    category: "chain",
    prompt: "less teal in the shadows",
    history: chainC08.history,
    grade: (d) => {
      // Either lower shadowSaturation, OR move shadowHue away from teal (~200).
      const sat = d.splitToning?.shadowSaturation;
      const hue = d.splitToning?.shadowHue;
      const satDown = sat !== undefined && sat < chainC08.finalParams.splitToning.shadowSaturation - 5;
      const hueAway = hue !== undefined && Math.abs(hue - 200) > 30;
      if (satDown || hueAway) return { passed: true, fails: [] };
      return {
        passed: false,
        fails: [
          `teal not reduced: prior split.shadow=hue ${chainC08.finalParams.splitToning.shadowHue}/sat ${chainC08.finalParams.splitToning.shadowSaturation}; delta split=${JSON.stringify(d.splitToning ?? {})}`,
        ],
      };
    },
  },
];

export const CASES: EvalCase[] = [
  ...literalCases,
  ...stylisticCases,
  ...chainCases,
];
