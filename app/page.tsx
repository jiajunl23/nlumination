import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { ArrowRight, Sparkles, Sliders, Palette } from "lucide-react";
import { SignInTrigger } from "@/components/auth/SignInTrigger";

export default function LandingPage() {
  return (
    <div className="relative flex flex-1 flex-col">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(60% 60% at 30% 10%, color-mix(in oklab, var(--color-accent) 22%, transparent), transparent 70%), radial-gradient(50% 50% at 80% 90%, color-mix(in oklab, var(--color-magenta) 20%, transparent), transparent 70%), radial-gradient(40% 40% at 20% 90%, color-mix(in oklab, var(--color-cyan) 16%, transparent), transparent 70%)",
        }}
      />

      <header className="flex items-center justify-between px-8 py-6">
        <Link href="/" className="flex items-center gap-2 font-medium tracking-tight">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[--color-accent] shadow-[0_0_12px_var(--color-accent-glow)]" />
          <span className="text-lg">
            N<span className="text-[--color-accent]">L</span>umination
          </span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Show when="signed-out">
            <SignInTrigger className="rounded-full px-4 py-1.5 text-[--color-fg-muted] transition hover:text-[--color-fg]">
              Sign in
            </SignInTrigger>
            <Link
              href="/editor"
              className="rounded-full bg-[--color-fg] px-4 py-1.5 text-[--color-bg] transition hover:opacity-90"
            >
              Try the editor
            </Link>
          </Show>
          <Show when="signed-in">
            <Link
              href="/gallery"
              className="rounded-full px-4 py-1.5 text-[--color-fg-muted] transition hover:text-[--color-fg]"
            >
              Gallery
            </Link>
            <Link
              href="/editor"
              className="rounded-full bg-[--color-fg] px-4 py-1.5 text-[--color-bg] transition hover:opacity-90"
            >
              Open editor
            </Link>
            <UserButton />
          </Show>
        </nav>
      </header>

      <main className="flex flex-1 items-center justify-center px-8 pb-24">
        <div className="max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[--color-border] bg-[--color-bg-elev-1] px-3 py-1 text-xs text-[--color-fg-muted]">
            <Sparkles className="h-3 w-3 text-[--color-accent]" />
            Natural-language color grading, in the browser
          </div>
          <h1 className="text-5xl font-medium leading-[1.05] tracking-tight md:text-6xl">
            Tell your photos how to{" "}
            <span className="bg-gradient-to-r from-[--color-accent] via-[--color-accent-glow] to-[--color-magenta] bg-clip-text text-transparent">
              feel.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-[--color-fg-muted]">
            Upload a photo, type something like{" "}
            <span className="text-[--color-fg]">&ldquo;moody, blue shadows, protect highlights&rdquo;</span>
            , and watch it transform. Lightroom-grade controls, zero learning curve.
          </p>

          <div className="mt-9 flex justify-center gap-3">
            <Link
              href="/editor"
              className="group inline-flex items-center gap-2 rounded-full bg-[--color-fg] px-5 py-2.5 text-sm font-medium text-[--color-bg] transition hover:opacity-90"
            >
              Open the editor
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Show when="signed-out">
              <SignInTrigger className="rounded-full border border-[--color-border] px-5 py-2.5 text-sm text-[--color-fg-muted] transition hover:border-[--color-border-strong] hover:text-[--color-fg]">
                Create an account
              </SignInTrigger>
            </Show>
          </div>

          <div className="mt-20 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
            <FeatureCard
              icon={<Sparkles className="h-4 w-4" />}
              title="Smart prompts"
              body="Compositional intent parsing — chain phrases, modifiers, and styles in one line."
            />
            <FeatureCard
              icon={<Sliders className="h-4 w-4" />}
              title="Pro sliders"
              body="WB, exposure, full tone, HSL per-channel, curves, split-tone, vignette."
            />
            <FeatureCard
              icon={<Palette className="h-4 w-4" />}
              title="Cinematic LUTs"
              body="Optional 3D LUT layer for film looks, applied with adjustable opacity."
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-[--color-border] bg-[--color-bg-elev-1] p-5 transition hover:border-[--color-border-strong]">
      <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-[--color-bg-elev-3] text-[--color-accent]">
        {icon}
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-[--color-fg-muted]">{body}</div>
    </div>
  );
}
