/**
 * Tool registry for the action agent (A3). One tool only — applyPreset.
 * Other potentially-useful tools (getImageStats, getPresetCatalog,
 * lookupGlossary) are unnecessary in the multi-agent design:
 *   - imageStats are already digested by A2 and arrive in the brief
 *   - the preset catalog is statically baked into A3's SYSTEM_PROMPT
 *   - photographic terms are explained by A1's `explicit_terms` output
 *
 * Each tool is `{name, description, parameters (JSON schema), execute}`.
 * `description` matters more than `parameters.type` for guiding LLM use —
 * a 20B model relies on natural-language clues to pick tools.
 */

import {
  HUE_BANDS,
  type GradingParams,
  type HslBand,
} from "@/lib/grading/params";
import { PRESETS_BY_ID, mergeParams } from "@/lib/nlp/presets";
import { LLM_JSON_SCHEMA } from "@/lib/nlp/llm-schema";
import type { AgentState } from "./state";

// The action agent delivers its final answer through a tool call rather
// than through response_format json_schema, because Groq rejects
// (`tools` + `response_format`) on the same request. Routing every
// output through tools gives one consistent contract.
export const SUBMIT_FINAL_DELTA_TOOL_NAME = "submitFinalDelta";

export interface Tool<Args = Record<string, unknown>> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Args, state: AgentState): unknown;
}

const APPLY_PRESET_PARAMETERS = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    name: {
      type: "string" as const,
      description:
        "Preset id (e.g. 'cinematic-teal-orange'). Must be one of the catalog ids listed in the system prompt.",
    },
  },
  required: ["name"],
};

export const applyPresetTool: Tool<{ name: string }> = {
  name: "applyPreset",
  description:
    "Preview the result of applying a named preset on top of the current grading params. Returns the diff (only fields that change) so you can decide whether to use it as a starting point for your final delta.",
  parameters: APPLY_PRESET_PARAMETERS,
  execute({ name }, state) {
    const preset = PRESETS_BY_ID[name];
    if (!preset) {
      return {
        error: `unknown preset: ${name}`,
        available: Object.keys(PRESETS_BY_ID),
      };
    }
    const after = mergeParams(state.currentParams, preset.params);
    const diff = paramsDiff(state.currentParams, after);
    return { preset_id: preset.id, label: preset.label, diff };
  },
};

// "Tool" used to deliver the final delta. Its parameters schema IS the
// LLMDelta JSON Schema. actionAgent intercepts this tool name specially
// (its execute() is never invoked — args ARE the answer).
export const submitFinalDeltaTool: Tool = {
  name: SUBMIT_FINAL_DELTA_TOOL_NAME,
  description:
    "Submit your final grading delta. Call this when you have finished reasoning. ALL fields are optional — include only the fields you want to change. The args of this call ARE the final answer.",
  parameters: LLM_JSON_SCHEMA,
  execute() {
    return null;
  },
};

export const TOOLS: Tool[] = [applyPresetTool as Tool, submitFinalDeltaTool];

export function dispatchTool(
  name: string,
  args: unknown,
  state: AgentState,
): unknown {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `unknown tool: ${name}` };
  try {
    return tool.execute(args as Record<string, unknown>, state);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "tool_error" };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Diff helper — shape mirrors LLMDelta so the model can re-emit it as a
// final delta with minimal cognitive cost. Only fields that materially
// changed are present (epsilon = 0.005).
// ────────────────────────────────────────────────────────────────────────

const NUMERIC_KEYS: ReadonlyArray<keyof GradingParams> = [
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "vibrance",
  "saturation",
  "clarity",
  "temperature",
  "tint",
];

function paramsDiff(
  before: GradingParams,
  after: GradingParams,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of NUMERIC_KEYS) {
    const a = before[k] as number;
    const b = after[k] as number;
    if (Math.abs(a - b) > 0.005) out[k] = +b.toFixed(2);
  }

  const hslDiff: Record<string, Partial<HslBand>> = {};
  for (const band of HUE_BANDS) {
    const ba = before.hsl[band];
    const af = after.hsl[band];
    const bd: Partial<HslBand> = {};
    if (Math.abs(ba.hue - af.hue) > 0.005) bd.hue = af.hue;
    if (Math.abs(ba.saturation - af.saturation) > 0.005) bd.saturation = af.saturation;
    if (Math.abs(ba.luminance - af.luminance) > 0.005) bd.luminance = af.luminance;
    if (Object.keys(bd).length) hslDiff[band] = bd;
  }
  if (Object.keys(hslDiff).length) out.hsl = hslDiff;

  const stDiff: Record<string, number> = {};
  const stKeys = [
    "shadowHue",
    "shadowSaturation",
    "highlightHue",
    "highlightSaturation",
    "balance",
  ] as const;
  for (const k of stKeys) {
    const a = before.splitToning[k];
    const b = after.splitToning[k];
    if (Math.abs(a - b) > 0.005) stDiff[k] = b;
  }
  if (Object.keys(stDiff).length) out.splitToning = stDiff;

  if (Math.abs(before.vignette.amount - after.vignette.amount) > 0.005) {
    out.vignetteAmount = after.vignette.amount;
  }
  return out;
}
