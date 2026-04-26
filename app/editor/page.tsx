import { Suspense } from "react";
import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { EditorRoot } from "@/components/editor/EditorRoot";
import { SignInTrigger } from "@/components/auth/SignInTrigger";

export default function EditorPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-elev-1)] px-6 py-3">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium tracking-tight">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent-glow)]" />
          N<span className="text-[var(--color-accent)]">L</span>umination
        </Link>
        <div className="flex items-center gap-3">
          <Show when="signed-in">
            <Link
              href="/gallery"
              className="text-xs text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
            >
              Gallery
            </Link>
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInTrigger className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]">
              Sign in to save
            </SignInTrigger>
          </Show>
        </div>
      </header>

      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-fg-muted)]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading editor…
          </div>
        }
      >
        <EditorRoot />
      </Suspense>
    </div>
  );
}
