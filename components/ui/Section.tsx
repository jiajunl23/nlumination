"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  /** Show a small reset link in the header. */
  onReset?: () => void;
  resetDisabled?: boolean;
};

export function Section({
  title,
  badge,
  defaultOpen = true,
  children,
  onReset,
  resetDisabled,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-[--color-border]/60 first:border-t-0">
      <header className="flex items-center justify-between py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[--color-fg-muted] transition hover:text-[--color-fg]"
        >
          <ChevronDown
            className={cn(
              "h-3 w-3 text-[--color-fg-dim] transition",
              !open && "-rotate-90",
            )}
          />
          {title}
          {badge}
        </button>
        {onReset && (
          <button
            type="button"
            disabled={resetDisabled}
            onClick={onReset}
            className="text-[10px] uppercase tracking-widest text-[--color-fg-dim] transition hover:text-[--color-accent] disabled:pointer-events-none disabled:opacity-30"
          >
            Reset
          </button>
        )}
      </header>
      {open && <div className="space-y-3 pb-3">{children}</div>}
    </section>
  );
}
