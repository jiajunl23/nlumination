/**
 * NL → GradingParams parser. No LLM.
 *
 * Algorithm:
 *   1. Normalise input (lower-case, full-width → half-width, strip noise).
 *   2. Walk left-to-right, longest-prefix match against a flat phrase list
 *      that contains every modifier and every intent surface form.
 *   3. Pair each intent with its modifiers: "pre" mods attach forward,
 *      "post" mods attach backward, "either" mods choose by neighbour.
 *      Handles "subtly warmer a bit" (both subtly and a bit scale warm) as
 *      well as "very warm, blue shadows".
 *   4. Apply each (intent, scale, invert) tuple's ops to a clone of the
 *      current params, in order.
 *
 * Returns the new params plus a `understood` list (UI feedback) and any
 * `unmatched` runs (used for chip suggestions).
 */

import {
  DEFAULT_PARAMS,
  cloneParams,
  PARAM_RANGES,
  type GradingParams,
} from "@/lib/grading/params";
import { INTENTS } from "./intents";
import { MODIFIERS } from "./modifiers";
import { PRESETS_BY_ID, mergeParams } from "./presets";
import type { Intent, IntentOp, Modifier, ParseResult } from "./types";

// ─── Phrase index ─────────────────────────────────────────────
type PhraseEntry =
  | { kind: "intent"; intent: Intent; phrase: string }
  | { kind: "modifier"; modifier: Modifier; phrase: string };

const PHRASE_INDEX: PhraseEntry[] = [
  ...MODIFIERS.flatMap((m) =>
    m.phrases.map((p) => ({ kind: "modifier" as const, modifier: m, phrase: normalize(p) })),
  ),
  ...INTENTS.flatMap((i) =>
    i.phrases.map((p) => ({ kind: "intent" as const, intent: i, phrase: normalize(p) })),
  ),
].sort((a, b) => b.phrase.length - a.phrase.length);

const FIRST_CHAR_INDEX: Map<string, PhraseEntry[]> = (() => {
  const m = new Map<string, PhraseEntry[]>();
  for (const e of PHRASE_INDEX) {
    const ch = e.phrase[0];
    if (!ch) continue;
    const arr = m.get(ch) ?? [];
    arr.push(e);
    m.set(ch, arr);
  }
  return m;
})();

// ─── Public entry point ───────────────────────────────────────
export function parsePrompt(input: string, base: GradingParams = DEFAULT_PARAMS): ParseResult {
  const text = normalize(input);
  const tokens = tokenize(text);
  const slots = pairModifiers(tokens);

  let params = cloneParams(base);
  const understood: ParseResult["understood"] = [];
  for (const slot of slots) {
    const scaled = applyScale(slot.intent.ops, slot.scale, slot.invert);
    params = applyOps(params, scaled);
    understood.push({ phrase: slot.phrase, description: slot.intent.description });
  }

  const unmatched = tokens
    .filter((t): t is Extract<Token, { type: "unmatched" }> => t.type === "unmatched")
    .map((t) => t.text.trim())
    .filter((s) => s.length > 0);

  return { params, understood, unmatched };
}

// ─── Tokenizer ────────────────────────────────────────────────
type Token =
  | { type: "modifier"; modifier: Modifier; phrase: string }
  | { type: "intent"; intent: Intent; phrase: string }
  | { type: "unmatched"; text: string };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let unmatchedStart = 0;
  const flushUnmatched = (end: number) => {
    if (unmatchedStart < end) {
      out.push({ type: "unmatched", text: text.slice(unmatchedStart, end) });
    }
  };

  while (i < text.length) {
    const ch = text[i];
    if (/[\s,.!?;:]/.test(ch)) {
      flushUnmatched(i);
      i++;
      unmatchedStart = i;
      continue;
    }

    const candidates = FIRST_CHAR_INDEX.get(ch) ?? [];
    let matched: PhraseEntry | null = null;
    for (const c of candidates) {
      if (text.startsWith(c.phrase, i)) {
        matched = c;
        break;
      }
    }

    if (matched) {
      flushUnmatched(i);
      if (matched.kind === "modifier") {
        out.push({ type: "modifier", modifier: matched.modifier, phrase: matched.phrase });
      } else {
        out.push({ type: "intent", intent: matched.intent, phrase: matched.phrase });
      }
      i += matched.phrase.length;
      unmatchedStart = i;
    } else {
      i++;
    }
  }
  flushUnmatched(text.length);
  return out;
}

// ─── Modifier ↔ Intent pairing ────────────────────────────────
type Slot = {
  intent: Intent;
  scale: number;
  invert: boolean;
  phrase: string;
};

function pairModifiers(tokens: Token[]): Slot[] {
  const slots: Slot[] = [];
  let pendingScale = 1;
  let pendingInvert = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type === "unmatched") continue;
    if (tok.type === "modifier") {
      const m = tok.modifier;
      const pos = m.position ?? "either";
      if (pos === "pre") {
        pendingScale *= m.scale;
        if (m.invert) pendingInvert = !pendingInvert;
      } else if (pos === "post") {
        if (slots.length > 0) {
          const last = slots[slots.length - 1];
          last.scale *= m.scale;
          if (m.invert) last.invert = !last.invert;
        }
        // If there's no preceding intent, drop it silently.
      } else {
        // "either": prefer attaching forward if next non-modifier is an intent.
        const next = nextNonModifier(tokens, i + 1);
        if (next?.type === "intent") {
          pendingScale *= m.scale;
          if (m.invert) pendingInvert = !pendingInvert;
        } else if (slots.length > 0) {
          const last = slots[slots.length - 1];
          last.scale *= m.scale;
          if (m.invert) last.invert = !last.invert;
        }
      }
      continue;
    }
    // intent token
    slots.push({
      intent: tok.intent,
      scale: pendingScale,
      invert: pendingInvert,
      phrase: tok.phrase,
    });
    pendingScale = 1;
    pendingInvert = false;
  }
  return slots;
}

function nextNonModifier(tokens: Token[], from: number): Token | null {
  for (let j = from; j < tokens.length; j++) {
    if (tokens[j].type !== "modifier") return tokens[j];
  }
  return null;
}

// ─── Op application ──────────────────────────────────────────
function applyScale(ops: IntentOp[], scale: number, invert: boolean): IntentOp[] {
  if (scale === 1 && !invert) return ops;
  return ops.map((op) => {
    if (op.kind === "delta") {
      return { ...op, amount: op.amount * scale * (invert ? -1 : 1) };
    }
    return op;
  });
}

function applyOps(base: GradingParams, ops: IntentOp[]): GradingParams {
  let out = base;
  for (const op of ops) out = applyOp(out, op);
  return out;
}

function applyOp(p: GradingParams, op: IntentOp): GradingParams {
  if (op.kind === "preset") {
    const preset = PRESETS_BY_ID[op.presetId];
    if (!preset) return p;
    return mergeParams(p, preset.params);
  }
  if (op.kind === "lut") {
    return { ...p, lutId: op.lutId, lutOpacity: op.opacity ?? 1 };
  }
  if (op.kind === "set") {
    return setPath(p, op.path, op.value);
  }
  const cur = getPath(p, op.path);
  if (typeof cur !== "number") return p;
  return setPath(p, op.path, clampForPath(op.path, cur + op.amount));
}

// ─── Nested-path helpers ─────────────────────────────────────
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (o, k) => (o == null ? o : (o as any)[k]),
    obj,
  );
}

function setPath<T extends object>(obj: T, path: string, value: unknown): T {
  const parts = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = Array.isArray(obj) ? [...obj] : { ...obj };
  let cursor = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    cursor[k] = Array.isArray(cursor[k]) ? [...cursor[k]] : { ...cursor[k] };
    cursor = cursor[k];
  }
  cursor[parts[parts.length - 1]] = value;
  return out;
}

function clampForPath(path: string, v: number): number {
  const ranges: Array<[RegExp, [number, number]]> = [
    [/^exposure$/, PARAM_RANGES.exposure as [number, number]],
    [/^temperature$/, PARAM_RANGES.temperature as [number, number]],
    [/^tint$/, PARAM_RANGES.tint as [number, number]],
    [/^contrast$/, PARAM_RANGES.contrast as [number, number]],
    [/^highlights$/, PARAM_RANGES.highlights as [number, number]],
    [/^shadows$/, PARAM_RANGES.shadows as [number, number]],
    [/^whites$/, PARAM_RANGES.whites as [number, number]],
    [/^blacks$/, PARAM_RANGES.blacks as [number, number]],
    [/^vibrance$/, PARAM_RANGES.vibrance as [number, number]],
    [/^saturation$/, PARAM_RANGES.saturation as [number, number]],
    [/^clarity$/, PARAM_RANGES.clarity as [number, number]],
    [/^hsl\.[^.]+\.hue$/, PARAM_RANGES.hslHue as [number, number]],
    [/^hsl\.[^.]+\.saturation$/, PARAM_RANGES.hslSaturation as [number, number]],
    [/^hsl\.[^.]+\.luminance$/, PARAM_RANGES.hslLuminance as [number, number]],
    [/^splitToning\.shadowHue$/, PARAM_RANGES.splitHue as [number, number]],
    [/^splitToning\.highlightHue$/, PARAM_RANGES.splitHue as [number, number]],
    [/^splitToning\.shadowSaturation$/, PARAM_RANGES.splitSat as [number, number]],
    [/^splitToning\.highlightSaturation$/, PARAM_RANGES.splitSat as [number, number]],
    [/^splitToning\.balance$/, PARAM_RANGES.balance as [number, number]],
    [/^vignette\.amount$/, PARAM_RANGES.vignetteAmount as [number, number]],
    [/^vignette\.midpoint$/, PARAM_RANGES.vignetteMidpoint as [number, number]],
    [/^vignette\.feather$/, PARAM_RANGES.vignetteFeather as [number, number]],
    [/^lutOpacity$/, PARAM_RANGES.lutOpacity as [number, number]],
  ];
  for (const [re, [lo, hi]] of ranges) {
    if (re.test(path)) return Math.min(hi, Math.max(lo, v));
  }
  return v;
}

// ─── Normalisation ───────────────────────────────────────────
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[　]/g, " ")
    .replace(/[!-~]/g, (ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 0xff01 && code <= 0xff5e) {
        return String.fromCharCode(code - 0xfee0);
      }
      return ch;
    })
    .replace(/\s+/g, " ");
}
