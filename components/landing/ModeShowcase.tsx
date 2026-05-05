/**
 * "Three ways to talk to your photos" — surfaces the Auto / LLM / Agents
 * pipeline modes from the editor onto the landing page so visitors know
 * the LLM capability exists before they hit the editor.
 *
 * Source-of-truth for label/hint is `lib/nlp/modes.ts` (`MODE_COST`). We
 * reuse those strings directly so this section can never drift out of
 * sync with the editor's mode toggle.
 *
 * The example prompts ARE landing-only copy — they're meant to be more
 * evocative than the editor's terse hint, and demonstrate the kind of
 * input each mode handles best. These are static; if we ever want them
 * to be data-driven we can promote them into `MODE_COST.examples` later.
 */
import type { ReactNode } from "react";
import { Zap, Sparkles, Bot } from "lucide-react";
import { MODE_COST } from "@/lib/nlp/modes";
import styles from "@/app/landing.module.css";

type ModeKey = "auto" | "llm" | "agents";

const ICON: Record<ModeKey, ReactNode> = {
  auto: <Zap className="h-4 w-4" />,
  llm: <Sparkles className="h-4 w-4" />,
  agents: <Bot className="h-4 w-4" />,
};

const ACCENT: Record<ModeKey, string> = {
  auto: "var(--color-cyan)",
  llm: "var(--color-accent-glow)",
  agents: "var(--color-magenta)",
};

const EXAMPLES: Record<ModeKey, string[]> = {
  auto: [
    "warmer, +0.3 exposure",
    "lift shadows, protect highlights",
    "vintage film",
  ],
  llm: [
    "make it feel like a Sunday morning",
    "moody, blue shadows, teal-orange split",
    "Wes Anderson but with more contrast",
  ],
  agents: [
    "this should feel hopeful but tired",
    "match the mood of a Lana Del Rey track",
    "make her look powerful in this portrait",
  ],
};

export function ModeShowcase() {
  const modes: ModeKey[] = ["auto", "llm", "agents"];

  return (
    <section className="mx-auto mt-32 w-full max-w-5xl px-2">
      <div
        className={`mb-10 text-center ${styles.fadeUpAnim}`}
        style={{ ["--d" as string]: "200ms" }}
      >
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev-1)] px-3 py-1 text-xs text-[var(--color-fg-muted)]">
          <Sparkles className="h-3 w-3 text-[var(--color-accent)]" />
          Three ways to talk to your photos
        </div>
        <h2 className="text-3xl font-medium tracking-tight md:text-4xl">
          From{" "}
          <span className="text-[var(--color-cyan)]">instant</span> to{" "}
          <span className="text-[var(--color-accent-glow)]">expressive</span> to{" "}
          <span className="text-[var(--color-magenta)]">deeply considered</span>.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-balance text-sm text-[var(--color-fg-muted)]">
          One toggle in the editor switches between a fast local parser, a
          single hosted LLM call, or a multi-agent pipeline that thinks about
          mood before it touches a slider.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {modes.map((m, i) => (
          <ModeCard
            key={m}
            mode={m}
            label={MODE_COST[m].label}
            hint={MODE_COST[m].hint}
            accent={ACCENT[m]}
            icon={ICON[m]}
            examples={EXAMPLES[m]}
            delay={300 + i * 120}
          />
        ))}
      </div>
    </section>
  );
}

function ModeCard({
  label,
  hint,
  accent,
  icon,
  examples,
  delay,
}: {
  mode: ModeKey;
  label: string;
  hint: string;
  accent: string;
  icon: ReactNode;
  examples: string[];
  delay: number;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev-1)] p-6 ${styles.fadeUpAnim} ${styles.modeCardFX}`}
      style={{ ["--d" as string]: `${delay}ms` }}
    >
      {/* per-card accent halo, only visible on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(60% 80% at 50% 0%, color-mix(in oklab, ${accent} 22%, transparent), transparent 70%)`,
        }}
      />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-bg-elev-3)]"
            style={{ color: accent }}
          >
            {icon}
          </span>
          <span className="text-sm font-semibold tracking-tight">{label}</span>
        </div>
        <p className="text-xs leading-relaxed text-[var(--color-fg-muted)]">
          {hint}
        </p>

        <div className="mt-4 space-y-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-fg-dim)]">
            Try saying
          </div>
          {examples.map((ex) => (
            <div
              key={ex}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--color-fg-muted)] transition-colors group-hover:border-[var(--color-border-strong)] group-hover:text-[var(--color-fg)]"
            >
              &ldquo;{ex}&rdquo;
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
