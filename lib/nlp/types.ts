import type { GradingParams } from "@/lib/grading/params";
import type { AdaptiveKey } from "./scalers";

export type IntentOp =
  /** Add `amount` to a numeric parameter (path may be nested). */
  | { kind: "delta"; path: string; amount: number }
  /** Overwrite a parameter (numeric or object). */
  | { kind: "set"; path: string; value: number | object }
  /** Apply a named preset (full param snapshot, may include LUT). */
  | { kind: "preset"; presetId: string }
  /** Activate or replace the LUT layer. */
  | { kind: "lut"; lutId: string; opacity?: number };

export type Intent = {
  /** All recognised surface forms, lowercased and normalised. */
  phrases: string[];
  /** What this intent does, in order. */
  ops: IntentOp[];
  /** Short human description shown in the "I understood..." chip. */
  description: string;
  /** Optional category for grouping in the chip palette. */
  category?: "light" | "color" | "tone" | "look" | "effect";
  /**
   * Optional adaptive-scaling key. When set and image stats are available,
   * the parser multiplies every `delta` op's amount by the scaler's output
   * (typically 0.2..1.5). Lets "brighten" be gentle on bright photos and
   * strong on dark ones without rewriting the slider math.
   */
  adaptive?: AdaptiveKey;
};

export type Modifier = {
  phrases: string[];
  /** Multiplier applied to the magnitude of the attached intent. */
  scale: number;
  /** True if it also flips sign (e.g. "less", "not too"). */
  invert?: boolean;
  /**
   * Where this modifier sits relative to the intent it scales.
   *  - "pre"   — appears before  ("subtly warm")
   *  - "post"  — appears after   ("warmer a bit")
   *  - "either" (default) — try pre first, then post
   */
  position?: "pre" | "post" | "either";
};

export type ParseResult = {
  /** New params after applying every matched op on top of `base`. */
  params: GradingParams;
  /** Things we recognised, in order. Used to display feedback. */
  understood: { phrase: string; description: string }[];
  /** Phrases the user typed that we couldn't match. */
  unmatched: string[];
};
