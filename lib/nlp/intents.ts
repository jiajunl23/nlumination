import type { Intent } from "./types";

/**
 * The intent dictionary.
 *
 * Each entry covers Chinese + English surface forms and emits one or more
 * parameter ops. The parser walks left-to-right doing longest-match against
 * `phrases`, so order here is irrelevant; what matters is that compound forms
 * (e.g. "阴影偏蓝") appear as their own entry rather than being split into
 * "阴影" + "偏蓝".
 *
 * Magnitudes are tuned to feel like a single press of a Lightroom-equivalent
 * slider — modifiers ("very" / "稍微") scale them at parse time.
 */
export const INTENTS: Intent[] = [
  // ── Light: exposure ────────────────────────────────────────────
  {
    category: "light",
    phrases: ["亮一点", "提亮", "调亮", "亮", "brighten", "brighter", "lighter"],
    ops: [{ kind: "delta", path: "exposure", amount: 0.4 }],
    description: "lift exposure",
  },
  {
    category: "light",
    phrases: ["暗一点", "压暗", "调暗", "暗", "darken", "darker"],
    ops: [{ kind: "delta", path: "exposure", amount: -0.4 }],
    description: "drop exposure",
  },
  {
    category: "light",
    phrases: ["过曝", "曝光过度", "overexposed"],
    ops: [{ kind: "delta", path: "exposure", amount: -0.6 }],
    description: "tame overexposure",
  },
  {
    category: "light",
    phrases: ["欠曝", "曝光不足", "underexposed"],
    ops: [{ kind: "delta", path: "exposure", amount: 0.6 }],
    description: "rescue underexposure",
  },

  // ── Light: tonal regions ──────────────────────────────────────
  {
    category: "tone",
    phrases: [
      "高光留白", "保留高光", "恢复高光", "压高光", "高光下沉", "高光压低",
      "protect highlights", "save highlights", "recover highlights", "tame highlights",
    ],
    ops: [{ kind: "delta", path: "highlights", amount: -45 }],
    description: "pull highlights",
  },
  {
    category: "tone",
    phrases: [
      "打开阴影", "提阴影", "阴影提亮", "拉阴影", "open shadows", "lift shadows",
    ],
    ops: [{ kind: "delta", path: "shadows", amount: 35 }],
    description: "open shadows",
  },
  {
    category: "tone",
    phrases: ["压黑部", "暗部下沉", "压黑", "压暗部", "deepen blacks", "crush blacks"],
    ops: [{ kind: "delta", path: "blacks", amount: -30 }],
    description: "deepen blacks",
  },
  {
    category: "tone",
    phrases: ["白点拉满", "提白点", "纯白拉高", "blow whites", "pure whites"],
    ops: [{ kind: "delta", path: "whites", amount: 30 }],
    description: "raise whites",
  },

  // ── Light: contrast ──────────────────────────────────────────
  {
    category: "light",
    phrases: ["对比强一点", "加大对比", "高对比", "硬一点", "punchy", "more contrast"],
    ops: [{ kind: "delta", path: "contrast", amount: 30 }],
    description: "more contrast",
  },
  {
    category: "light",
    phrases: ["对比弱一点", "降低对比", "低对比", "平淡", "柔一点", "less contrast", "flat"],
    ops: [{ kind: "delta", path: "contrast", amount: -25 }],
    description: "less contrast",
  },

  // ── Color temperature ────────────────────────────────────────
  {
    category: "color",
    phrases: ["暖", "暖色", "偏暖", "warm", "warmer", "warm tones"],
    ops: [{ kind: "delta", path: "temperature", amount: 22 }],
    description: "warmer",
  },
  {
    category: "color",
    phrases: ["冷", "冷色", "偏冷", "冷调", "cool", "cooler", "cool tones"],
    ops: [{ kind: "delta", path: "temperature", amount: -22 }],
    description: "cooler",
  },
  {
    category: "color",
    phrases: ["偏黄", "黄一点", "yellow tint"],
    ops: [{ kind: "delta", path: "temperature", amount: 15 }],
    description: "shift yellow",
  },
  {
    category: "color",
    phrases: ["偏蓝", "蓝一点", "blue tint"],
    ops: [{ kind: "delta", path: "temperature", amount: -15 }],
    description: "shift blue",
  },
  {
    category: "color",
    phrases: ["偏粉", "粉一点", "magenta tint", "pink tint"],
    ops: [{ kind: "delta", path: "tint", amount: 18 }],
    description: "shift pink",
  },
  {
    category: "color",
    phrases: ["偏绿", "绿一点", "green tint"],
    ops: [{ kind: "delta", path: "tint", amount: -18 }],
    description: "shift green",
  },

  // ── Color: saturation / vibrance ─────────────────────────────
  {
    category: "color",
    phrases: ["鲜艳", "饱和高", "饱和度高", "色彩浓", "vivid", "saturated", "more saturation"],
    ops: [{ kind: "delta", path: "saturation", amount: 22 }],
    description: "more saturated",
  },
  {
    category: "color",
    phrases: ["淡雅", "低饱和", "灰一点", "色彩淡", "muted", "desaturated"],
    ops: [{ kind: "delta", path: "saturation", amount: -22 }],
    description: "muted color",
  },
  {
    category: "color",
    phrases: ["黑白", "灰阶", "monochrome", "black and white", "b&w"],
    ops: [{ kind: "set", path: "saturation", value: -100 }],
    description: "black & white",
  },
  {
    category: "color",
    phrases: ["通透", "饱和适度提一点", "vibrant", "more vibrance"],
    ops: [{ kind: "delta", path: "vibrance", amount: 28 }],
    description: "more vibrance",
  },

  // ── Effects: clarity / vignette ──────────────────────────────
  {
    category: "effect",
    phrases: ["清晰", "锐一点", "锐利", "清晰度", "punch", "punchier"],
    ops: [{ kind: "delta", path: "clarity", amount: 25 }],
    description: "more clarity",
  },
  {
    category: "effect",
    phrases: ["朦胧", "柔焦", "softer", "dreamy"],
    ops: [{ kind: "delta", path: "clarity", amount: -25 }],
    description: "softer",
  },
  {
    category: "effect",
    phrases: ["暗角", "压角", "聚焦", "vignette", "spotlight"],
    ops: [{ kind: "delta", path: "vignette.amount", amount: -28 }],
    description: "darken corners",
  },

  // ── HSL: per-color shifts (most common asks) ────────────────
  {
    category: "color",
    phrases: ["天空更蓝", "蓝色更深", "天蓝一点", "deeper blue sky", "bluer sky"],
    ops: [
      { kind: "delta", path: "hsl.blue.saturation", amount: 25 },
      { kind: "delta", path: "hsl.blue.luminance", amount: -15 },
    ],
    description: "deepen blue sky",
  },
  {
    category: "color",
    phrases: ["草地更绿", "绿色加深", "greener foliage", "deeper greens"],
    ops: [
      { kind: "delta", path: "hsl.green.saturation", amount: 20 },
      { kind: "delta", path: "hsl.green.luminance", amount: -10 },
    ],
    description: "deepen greens",
  },
  {
    category: "color",
    phrases: ["皮肤通透", "肤色通透", "skin glow", "warm skin"],
    ops: [
      { kind: "delta", path: "hsl.orange.saturation", amount: -8 },
      { kind: "delta", path: "hsl.orange.luminance", amount: 12 },
    ],
    description: "skin warmth",
  },
  {
    category: "color",
    phrases: ["夕阳更橙", "晚霞", "sunset glow", "golden hour"],
    ops: [
      { kind: "delta", path: "hsl.orange.saturation", amount: 28 },
      { kind: "delta", path: "hsl.yellow.saturation", amount: 18 },
      { kind: "delta", path: "temperature", amount: 12 },
    ],
    description: "sunset glow",
  },
  {
    category: "color",
    phrases: ["红色更深", "红色加深", "deeper reds"],
    ops: [
      { kind: "delta", path: "hsl.red.saturation", amount: 22 },
      { kind: "delta", path: "hsl.red.luminance", amount: -8 },
    ],
    description: "deepen reds",
  },

  // ── Split toning: explicit shadow / highlight tints ──────────
  {
    category: "tone",
    phrases: ["阴影偏蓝", "暗部偏蓝", "blue shadows", "shadows blue"],
    ops: [
      { kind: "set", path: "splitToning.shadowHue", value: 215 },
      { kind: "delta", path: "splitToning.shadowSaturation", amount: 25 },
    ],
    description: "blue shadows",
  },
  {
    category: "tone",
    phrases: ["阴影偏青", "暗部偏青", "teal shadows"],
    ops: [
      { kind: "set", path: "splitToning.shadowHue", value: 185 },
      { kind: "delta", path: "splitToning.shadowSaturation", amount: 28 },
    ],
    description: "teal shadows",
  },
  {
    category: "tone",
    phrases: ["阴影偏绿", "暗部偏绿", "green shadows"],
    ops: [
      { kind: "set", path: "splitToning.shadowHue", value: 130 },
      { kind: "delta", path: "splitToning.shadowSaturation", amount: 22 },
    ],
    description: "green shadows",
  },
  {
    category: "tone",
    phrases: ["高光偏粉", "highlights pink", "pink highlights"],
    ops: [
      { kind: "set", path: "splitToning.highlightHue", value: 340 },
      { kind: "delta", path: "splitToning.highlightSaturation", amount: 22 },
    ],
    description: "pink highlights",
  },
  {
    category: "tone",
    phrases: ["高光偏橙", "highlights orange", "orange highlights"],
    ops: [
      { kind: "set", path: "splitToning.highlightHue", value: 30 },
      { kind: "delta", path: "splitToning.highlightSaturation", amount: 26 },
    ],
    description: "orange highlights",
  },
  {
    category: "tone",
    phrases: ["高光偏黄", "yellow highlights"],
    ops: [
      { kind: "set", path: "splitToning.highlightHue", value: 50 },
      { kind: "delta", path: "splitToning.highlightSaturation", amount: 20 },
    ],
    description: "yellow highlights",
  },

  // ── Style presets (compose multi-op looks) ──────────────────
  {
    category: "look",
    phrases: ["电影感", "电影色调", "电影", "cinematic", "movie look"],
    ops: [{ kind: "preset", presetId: "cinematic-teal-orange" }],
    description: "cinematic teal-orange",
  },
  {
    category: "look",
    phrases: ["胶片", "胶片感", "film look", "filmic"],
    ops: [{ kind: "preset", presetId: "film-emulation" }],
    description: "film emulation",
  },
  {
    category: "look",
    phrases: ["复古", "vintage", "retro"],
    ops: [{ kind: "preset", presetId: "vintage-fade" }],
    description: "vintage fade",
  },
  {
    category: "look",
    phrases: ["小清新", "清新", "fresh", "airy", "bright and airy"],
    ops: [{ kind: "preset", presetId: "bright-airy" }],
    description: "bright & airy",
  },
  {
    category: "look",
    phrases: ["阴郁", "moody", "dark mood"],
    ops: [{ kind: "preset", presetId: "moody" }],
    description: "moody",
  },
  {
    category: "look",
    phrases: ["晨雾", "morning mist", "soft morning"],
    ops: [{ kind: "preset", presetId: "morning-mist" }],
    description: "morning mist",
  },
  {
    category: "look",
    phrases: ["赛博朋克", "cyberpunk", "neon"],
    ops: [{ kind: "preset", presetId: "cyberpunk" }],
    description: "cyberpunk",
  },
  {
    category: "look",
    phrases: ["夕阳", "黄金时刻", "sunset", "golden"],
    ops: [{ kind: "preset", presetId: "golden-hour" }],
    description: "golden hour",
  },
];
