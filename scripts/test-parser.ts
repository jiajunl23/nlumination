/**
 * Smoke test for the NL parser. Run with:
 *   pnpm tsx scripts/test-parser.ts
 *
 * Prints what each prompt resolves to. Useful for quick sanity checks
 * after edits to intents.ts / modifiers.ts / parser.ts.
 */

import { parsePrompt } from "../lib/nlp/parser";
import { DEFAULT_PARAMS } from "../lib/grading/params";

const cases = [
  "暗一点",
  "很暖",
  "稍微暖一点",
  "电影感",
  "电影感、暖一点、阴影偏蓝",
  "moody, blue shadows, protect highlights",
  "天空更蓝、草地更绿",
  "黑白",
  "asdfqwerty",
  "暖一些、暖一些、暖一些",
  "夕阳、暗角",
];

for (const prompt of cases) {
  const r = parsePrompt(prompt, DEFAULT_PARAMS);
  console.log(`\n──── "${prompt}"`);
  console.log("understood:", r.understood.map((u) => u.description).join(" + ") || "(none)");
  if (r.unmatched.length) console.log("unmatched:", r.unmatched.join(", "));
  console.log(
    "key params:",
    JSON.stringify({
      exposure: r.params.exposure,
      temperature: r.params.temperature,
      saturation: r.params.saturation,
      contrast: r.params.contrast,
      shadows: r.params.shadows,
      highlights: r.params.highlights,
      "splitToning.shadowHue": r.params.splitToning.shadowHue,
      "splitToning.shadowSat": r.params.splitToning.shadowSaturation,
      "hsl.blue.sat": r.params.hsl.blue.saturation,
      "hsl.green.sat": r.params.hsl.green.saturation,
      "vignette.amount": r.params.vignette.amount,
    }),
  );
}
