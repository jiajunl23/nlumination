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
  { label: "Cinematic", prompt: "cinematic", category: "look" },
  { label: "Film", prompt: "filmic", category: "look" },
  { label: "Bright & Airy", prompt: "bright and airy", category: "look" },
  { label: "Moody", prompt: "moody, blue shadows", category: "look" },
  { label: "Golden Hour", prompt: "golden hour, warmer", category: "look" },
  { label: "Cyberpunk", prompt: "cyberpunk", category: "look" },
  { label: "Bluer Sky", prompt: "bluer sky", category: "color" },
  { label: "Greener Foliage", prompt: "greener foliage", category: "color" },
  { label: "Warmer", prompt: "warmer", category: "color" },
  { label: "Cooler", prompt: "cooler", category: "color" },
  { label: "More Punch", prompt: "more contrast, punchier", category: "tone" },
  { label: "Soft Mood", prompt: "less contrast, softer", category: "tone" },
];
