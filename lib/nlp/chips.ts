/**
 * Curated quick-prompt chips. The user can tap one to fill the prompt bar.
 * They're intentionally compositional — each phrase is itself parseable so
 * tapping a chip is the same as typing it.
 */

export type Chip = {
  label: string;
  prompt: string;
  category: "look" | "color" | "tone" | "light";
};

export const CHIPS: Chip[] = [
  { label: "Cinematic", prompt: "电影感", category: "look" },
  { label: "Film", prompt: "胶片感", category: "look" },
  { label: "Bright & Airy", prompt: "小清新", category: "look" },
  { label: "Moody", prompt: "阴郁、阴影偏蓝", category: "look" },
  { label: "Golden Hour", prompt: "夕阳、暖一点", category: "look" },
  { label: "Cyberpunk", prompt: "赛博朋克", category: "look" },
  { label: "Bluer Sky", prompt: "天空更蓝", category: "color" },
  { label: "Greener Foliage", prompt: "草地更绿", category: "color" },
  { label: "Warmer", prompt: "暖一点", category: "color" },
  { label: "Cooler", prompt: "冷一点", category: "color" },
  { label: "More Punch", prompt: "对比强一点、清晰", category: "tone" },
  { label: "Soft Mood", prompt: "对比弱一点、柔焦", category: "tone" },
];
