import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { ArrowRight, Sparkles, Sliders, Palette, Wand2 } from "lucide-react";
import { SignInTrigger } from "@/components/auth/SignInTrigger";
import { ModeShowcase } from "@/components/landing/ModeShowcase";
import { AnimatedPromptTicker } from "@/components/landing/AnimatedPromptTicker";
import styles from "./landing.module.css";

/**
 * Marketing surface for NLumination. Stays a server component — only the
 * prompt ticker needs "use client".
 *
 * Animations live in `landing.module.css` (CSS module → page-scoped, won't
 * leak into the editor / gallery routes which other agents own). Three
 * animation types are layered:
 *
 *   1. Entry — `fadeUpAnim` / `blurInAnim` cascade across hero + sections
 *      via `--d` CSS var so blocks reveal sequentially on first paint.
 *   2. Continuous — `gradientDrift` on the hero highlight word and the
 *      primary CTA's `ctaPulse` keep the page alive without scroll.
 *   3. Hover micro-interactions — `cardFX`/`modeCardFX`/`primaryCtaFX`
 *      lift, glow, or shift gradient on pointer over.
 */
export default function LandingPage() {
  return (
    <div className="relative flex flex-1 flex-col">
      <header className="flex items-center justify-between px-8 py-6">
        <Link
          href="/"
          className="group bg-gradient-to-r from-[var(--color-accent)] via-[var(--color-accent-glow)] to-[var(--color-magenta)] bg-clip-text text-xl font-semibold leading-none tracking-tight text-transparent transition group-hover:opacity-90"
        >
          NLumination
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Show when="signed-out">
            <SignInTrigger className="rounded-full px-4 py-1.5 text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]">
              Sign in
            </SignInTrigger>
            <Link
              href="/editor"
              className="rounded-full bg-[var(--color-fg)] px-4 py-1.5 text-[var(--color-bg)] transition hover:opacity-90"
            >
              Try the editor
            </Link>
          </Show>
          <Show when="signed-in">
            <Link
              href="/gallery"
              className="rounded-full px-4 py-1.5 text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
            >
              Gallery
            </Link>
            <Link
              href="/editor"
              className="rounded-full bg-[var(--color-fg)] px-4 py-1.5 text-[var(--color-bg)] transition hover:opacity-90"
            >
              Open editor
            </Link>
            <UserButton />
          </Show>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 pb-24 sm:px-8">
        {/* --- Hero ------------------------------------------------- */}
        <section className="flex w-full max-w-3xl flex-col items-center pt-8 text-center sm:pt-16">
          <div
            className={`mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev-1)] px-3 py-1 text-xs text-[var(--color-fg-muted)] ${styles.fadeUpAnim}`}
            style={{ ["--d" as string]: "0ms" }}
          >
            <Sparkles className="h-3 w-3 text-[var(--color-accent)]" />
            Natural-language color grading, in the browser
          </div>

          <h1
            className={`text-5xl font-medium leading-[1.05] tracking-tight md:text-6xl ${styles.blurInAnim}`}
            style={{ ["--d" as string]: "120ms" }}
          >
            Tell your photos how to{" "}
            <span
              className={`bg-gradient-to-r from-[var(--color-accent)] via-[var(--color-accent-glow)] to-[var(--color-magenta)] bg-clip-text text-transparent ${styles.gradientDrift}`}
            >
              feel.
            </span>
          </h1>

          <p
            className={`mx-auto mt-5 max-w-xl text-balance text-[var(--color-fg-muted)] ${styles.fadeUpAnim}`}
            style={{ ["--d" as string]: "260ms" }}
          >
            Upload a photo, type something like{" "}
            <span className="text-[var(--color-fg)]">
              &ldquo;moody, blue shadows, protect highlights&rdquo;
            </span>
            , and watch it transform. Lightroom-grade controls, zero learning curve.
          </p>

          <div
            className={`w-full ${styles.fadeUpAnim}`}
            style={{ ["--d" as string]: "360ms" }}
          >
            <AnimatedPromptTicker />
          </div>

          <div
            className={`mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row ${styles.fadeUpAnim}`}
            style={{ ["--d" as string]: "460ms" }}
          >
            {/* Primary gradient CTA — third button style (was missing). */}
            <Link
              href="/editor"
              className={`group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-accent)] via-[var(--color-accent-glow)] to-[var(--color-magenta)] px-6 py-3 text-sm font-semibold text-[var(--color-bg)] ${styles.primaryCtaFX} ${styles.ctaPulse}`}
            >
              <Wand2 className="h-4 w-4" />
              Start editing free
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
            {/* Existing white-pill secondary. */}
            <Link
              href="/editor"
              className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-fg)] px-5 py-2.5 text-sm font-medium text-[var(--color-bg)] transition hover:opacity-90"
            >
              Open the editor
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            {/* Existing ghost-border tertiary. */}
            <Show when="signed-out">
              <SignInTrigger className="rounded-full border border-[var(--color-border)] px-5 py-2.5 text-sm text-[var(--color-fg-muted)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]">
                Create an account
              </SignInTrigger>
            </Show>
          </div>
        </section>

        {/* --- Feature cards (kept from original, animation upgraded) -- */}
        <section className="mt-20 grid w-full max-w-3xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
          <FeatureCard
            icon={<Sparkles className="h-4 w-4" />}
            title="Smart prompts"
            body="Compositional intent parsing — chain phrases, modifiers, and styles in one line."
            delay={600}
          />
          <FeatureCard
            icon={<Sliders className="h-4 w-4" />}
            title="Pro sliders"
            body="WB, exposure, full tone, HSL per-channel, curves, split-tone, vignette."
            delay={720}
          />
          <FeatureCard
            icon={<Palette className="h-4 w-4" />}
            title="Cinematic LUTs"
            body="Optional 3D LUT layer for film looks, applied with adjustable opacity."
            delay={840}
          />
        </section>

        {/* --- Mode showcase (new section) --------------------------- */}
        <ModeShowcase />

        {/* --- Tail CTA --------------------------------------------- */}
        <section
          className={`mt-32 w-full max-w-2xl text-center ${styles.fadeUpAnim}`}
          style={{ ["--d" as string]: "200ms" }}
        >
          <h3 className="text-2xl font-medium tracking-tight md:text-3xl">
            Ready to talk to your photos?
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm text-[var(--color-fg-muted)]">
            No install, no plugins — drop a photo into the editor and start
            describing how it should feel.
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              href="/editor"
              className={`group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-accent)] via-[var(--color-accent-glow)] to-[var(--color-magenta)] px-6 py-3 text-sm font-semibold text-[var(--color-bg)] ${styles.primaryCtaFX}`}
            >
              <Wand2 className="h-4 w-4" />
              Open the editor
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  delay: number;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev-1)] p-5 ${styles.fadeUpAnim} ${styles.cardFX} hover:border-[var(--color-border-strong)]`}
      style={{ ["--d" as string]: `${delay}ms` }}
    >
      <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-bg-elev-3)] text-[var(--color-accent)]">
        {icon}
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-[var(--color-fg-muted)]">
        {body}
      </div>
    </div>
  );
}
