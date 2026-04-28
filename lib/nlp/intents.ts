import type { Intent } from "./types";

/**
 * The intent dictionary.
 *
 * Each entry covers one or more English surface forms and emits one or more
 * parameter ops. The parser walks left-to-right doing longest-match against
 * `phrases`, so order here is irrelevant; what matters is that compound
 * forms (e.g. "blue shadows") appear as their own entry rather than being
 * split into "blue" + "shadows".
 *
 * Magnitudes are tuned to feel like a single press of a Lightroom-equivalent
 * slider — modifiers ("very" / "subtly") scale them at parse time.
 */
export const INTENTS: Intent[] = [
  // ── Light: exposure ────────────────────────────────────────────
  {
    category: "light",
    phrases: ["brighten", "brighter", "lighter", "lift exposure"],
    ops: [{ kind: "delta", path: "exposure", amount: 0.4 }],
    description: "lift exposure",
    adaptive: "brighten",
  },
  {
    category: "light",
    phrases: ["darken", "darker", "drop exposure"],
    ops: [{ kind: "delta", path: "exposure", amount: -0.4 }],
    description: "drop exposure",
    adaptive: "darken",
  },
  {
    category: "light",
    phrases: ["overexposed", "too bright"],
    ops: [{ kind: "delta", path: "exposure", amount: -0.6 }],
    description: "tame overexposure",
    adaptive: "darken",
  },
  {
    category: "light",
    phrases: ["underexposed", "too dark"],
    ops: [{ kind: "delta", path: "exposure", amount: 0.6 }],
    description: "rescue underexposure",
    adaptive: "brighten",
  },

  // ── Light: tonal regions ──────────────────────────────────────
  {
    category: "tone",
    phrases: [
      "protect highlights", "save highlights", "recover highlights", "tame highlights",
      "pull highlights",
    ],
    ops: [{ kind: "delta", path: "highlights", amount: -45 }],
    description: "pull highlights",
    adaptive: "highlightsPull",
  },
  {
    category: "tone",
    phrases: ["open shadows", "lift shadows", "raise shadows"],
    ops: [{ kind: "delta", path: "shadows", amount: 35 }],
    description: "open shadows",
    adaptive: "shadowsLift",
  },
  {
    category: "tone",
    phrases: ["deepen blacks", "crush blacks"],
    ops: [{ kind: "delta", path: "blacks", amount: -30 }],
    description: "deepen blacks",
    adaptive: "blacksDeepen",
  },
  {
    category: "tone",
    phrases: ["blow whites", "pure whites", "raise whites"],
    ops: [{ kind: "delta", path: "whites", amount: 30 }],
    description: "raise whites",
  },

  // ── Light: contrast ──────────────────────────────────────────
  {
    category: "light",
    phrases: ["punchy", "punchier", "more contrast", "high contrast"],
    ops: [{ kind: "delta", path: "contrast", amount: 30 }],
    description: "more contrast",
    adaptive: "contrastUp",
  },
  {
    category: "light",
    phrases: ["less contrast", "low contrast", "flat"],
    ops: [{ kind: "delta", path: "contrast", amount: -25 }],
    description: "less contrast",
    adaptive: "contrastDown",
  },

  // ── Color temperature ────────────────────────────────────────
  {
    category: "color",
    phrases: ["warm", "warmer", "warm tones"],
    ops: [{ kind: "delta", path: "temperature", amount: 22 }],
    description: "warmer",
    adaptive: "warm",
  },
  {
    category: "color",
    phrases: ["cool", "cooler", "cool tones"],
    ops: [{ kind: "delta", path: "temperature", amount: -22 }],
    description: "cooler",
    adaptive: "cool",
  },
  {
    category: "color",
    phrases: ["yellow tint"],
    ops: [{ kind: "delta", path: "temperature", amount: 15 }],
    description: "shift yellow",
  },
  {
    category: "color",
    phrases: ["blue tint"],
    ops: [{ kind: "delta", path: "temperature", amount: -15 }],
    description: "shift blue",
  },
  {
    category: "color",
    phrases: ["magenta tint", "pink tint"],
    ops: [{ kind: "delta", path: "tint", amount: 18 }],
    description: "shift pink",
  },
  {
    category: "color",
    phrases: ["green tint"],
    ops: [{ kind: "delta", path: "tint", amount: -18 }],
    description: "shift green",
  },

  // ── Color: saturation / vibrance ─────────────────────────────
  {
    category: "color",
    phrases: ["vivid", "saturated", "more saturation"],
    ops: [{ kind: "delta", path: "saturation", amount: 22 }],
    description: "more saturated",
    adaptive: "saturationUp",
  },
  {
    category: "color",
    phrases: ["muted", "desaturated", "less saturation"],
    ops: [{ kind: "delta", path: "saturation", amount: -22 }],
    description: "muted color",
  },
  {
    category: "color",
    phrases: ["monochrome", "black and white", "b&w"],
    ops: [{ kind: "set", path: "saturation", value: -100 }],
    description: "black & white",
  },
  {
    category: "color",
    phrases: ["vibrant", "more vibrance"],
    ops: [{ kind: "delta", path: "vibrance", amount: 28 }],
    description: "more vibrance",
  },

  // ── Effects: clarity / vignette ──────────────────────────────
  {
    category: "effect",
    phrases: ["sharp", "sharper", "punch", "more clarity"],
    ops: [{ kind: "delta", path: "clarity", amount: 25 }],
    description: "more clarity",
  },
  {
    category: "effect",
    phrases: ["softer", "dreamy", "soft focus"],
    ops: [{ kind: "delta", path: "clarity", amount: -25 }],
    description: "softer",
  },
  {
    category: "effect",
    phrases: ["vignette", "spotlight", "darken corners"],
    ops: [{ kind: "delta", path: "vignette.amount", amount: -28 }],
    description: "darken corners",
  },

  // ── HSL: per-color shifts (most common asks) ────────────────
  {
    category: "color",
    phrases: ["deeper blue sky", "bluer sky", "deeper sky"],
    ops: [
      { kind: "delta", path: "hsl.blue.saturation", amount: 25 },
      { kind: "delta", path: "hsl.blue.luminance", amount: -15 },
    ],
    description: "deepen blue sky",
  },
  {
    category: "color",
    phrases: ["greener foliage", "deeper greens"],
    ops: [
      { kind: "delta", path: "hsl.green.saturation", amount: 20 },
      { kind: "delta", path: "hsl.green.luminance", amount: -10 },
    ],
    description: "deepen greens",
  },
  {
    category: "color",
    phrases: ["skin glow", "warm skin"],
    ops: [
      { kind: "delta", path: "hsl.orange.saturation", amount: -8 },
      { kind: "delta", path: "hsl.orange.luminance", amount: 12 },
    ],
    description: "skin warmth",
  },
  {
    category: "color",
    phrases: ["sunset glow", "golden hour"],
    ops: [
      { kind: "delta", path: "hsl.orange.saturation", amount: 28 },
      { kind: "delta", path: "hsl.yellow.saturation", amount: 18 },
      { kind: "delta", path: "temperature", amount: 12 },
    ],
    description: "sunset glow",
  },
  {
    category: "color",
    phrases: ["deeper reds"],
    ops: [
      { kind: "delta", path: "hsl.red.saturation", amount: 22 },
      { kind: "delta", path: "hsl.red.luminance", amount: -8 },
    ],
    description: "deepen reds",
  },

  // ── Split toning: explicit shadow / highlight tints ──────────
  {
    category: "tone",
    phrases: ["blue shadows", "shadows blue"],
    ops: [
      { kind: "set", path: "splitToning.shadowHue", value: 215 },
      { kind: "delta", path: "splitToning.shadowSaturation", amount: 25 },
    ],
    description: "blue shadows",
  },
  {
    category: "tone",
    phrases: ["teal shadows"],
    ops: [
      { kind: "set", path: "splitToning.shadowHue", value: 185 },
      { kind: "delta", path: "splitToning.shadowSaturation", amount: 28 },
    ],
    description: "teal shadows",
  },
  {
    category: "tone",
    phrases: ["green shadows"],
    ops: [
      { kind: "set", path: "splitToning.shadowHue", value: 130 },
      { kind: "delta", path: "splitToning.shadowSaturation", amount: 22 },
    ],
    description: "green shadows",
  },
  {
    category: "tone",
    phrases: ["highlights pink", "pink highlights"],
    ops: [
      { kind: "set", path: "splitToning.highlightHue", value: 340 },
      { kind: "delta", path: "splitToning.highlightSaturation", amount: 22 },
    ],
    description: "pink highlights",
  },
  {
    category: "tone",
    phrases: ["highlights orange", "orange highlights"],
    ops: [
      { kind: "set", path: "splitToning.highlightHue", value: 30 },
      { kind: "delta", path: "splitToning.highlightSaturation", amount: 26 },
    ],
    description: "orange highlights",
  },
  {
    category: "tone",
    phrases: ["yellow highlights"],
    ops: [
      { kind: "set", path: "splitToning.highlightHue", value: 50 },
      { kind: "delta", path: "splitToning.highlightSaturation", amount: 20 },
    ],
    description: "yellow highlights",
  },

  // ── Style presets (compose multi-op looks) ──────────────────
  {
    category: "look",
    phrases: ["cinematic", "movie look", "teal and orange"],
    ops: [{ kind: "preset", presetId: "cinematic-teal-orange" }],
    description: "cinematic teal-orange",
  },
  {
    category: "look",
    phrases: ["film look", "filmic", "film"],
    ops: [{ kind: "preset", presetId: "film-emulation" }],
    description: "film emulation",
  },
  {
    category: "look",
    phrases: ["vintage", "retro"],
    ops: [{ kind: "preset", presetId: "vintage-fade" }],
    description: "vintage fade",
  },
  {
    category: "look",
    phrases: ["bright and airy", "fresh", "airy"],
    ops: [{ kind: "preset", presetId: "bright-airy" }],
    description: "bright & airy",
  },
  {
    category: "look",
    phrases: ["moody", "dark mood"],
    ops: [{ kind: "preset", presetId: "moody" }],
    description: "moody",
  },
  {
    category: "look",
    phrases: ["morning mist", "soft morning"],
    ops: [{ kind: "preset", presetId: "morning-mist" }],
    description: "morning mist",
  },
  {
    category: "look",
    phrases: ["cyberpunk", "neon"],
    ops: [{ kind: "preset", presetId: "cyberpunk" }],
    description: "cyberpunk",
  },
  {
    category: "look",
    phrases: ["sunset", "golden"],
    ops: [{ kind: "preset", presetId: "golden-hour" }],
    description: "golden hour",
  },
];
