"use client";

/**
 * Tiny client component for the hero — cycles through a few sample prompts
 * inside a "fake input" pill below the headline so the page has motion
 * even before the user scrolls. Pure presentation, no real input handling.
 *
 * Cycle interval is intentionally slow (3s) — fast cycling makes the page
 * feel busy/anxious; the goal is "the page is alive" not "look at me".
 */
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const PROMPTS = [
  "moody, blue shadows, protect highlights",
  "warm sunset, lifted blacks, soft skin",
  "cinematic teal & orange, low contrast",
  "make it feel like a Sunday morning",
  "dreamy pastels, washed-out highlights",
];

export function AnimatedPromptTicker() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setI((prev) => (prev + 1) % PROMPTS.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="mx-auto mt-7 flex w-full max-w-md items-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev-1)]/80 px-4 py-2.5 text-left backdrop-blur"
      aria-live="polite"
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
      <div className="relative h-5 flex-1 overflow-hidden font-mono text-xs text-[var(--color-fg-muted)]">
        {PROMPTS.map((p, idx) => (
          <span
            key={p}
            className="absolute inset-0 truncate transition-all duration-500 ease-out"
            style={{
              opacity: idx === i ? 1 : 0,
              transform: idx === i ? "translateY(0)" : idx < i ? "translateY(-100%)" : "translateY(100%)",
            }}
          >
            &ldquo;{p}&rdquo;
          </span>
        ))}
      </div>
      <span className="hidden shrink-0 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-fg-dim)] sm:inline">
        live
      </span>
    </div>
  );
}
