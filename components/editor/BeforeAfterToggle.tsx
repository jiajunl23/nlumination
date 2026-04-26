"use client";

import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  active: boolean;
  onChange: (active: boolean) => void;
  className?: string;
};

/** Hold (mouse / touch) or toggle (keyboard) to compare against the original. */
export function BeforeAfterToggle({ active, onChange, className }: Props) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        onChange(true);
      }}
      onPointerUp={() => onChange(false)}
      onPointerLeave={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onKeyDown={(e) => {
        if (e.key === "b" || e.key === "B") onChange(!active);
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev-2)]/80 px-3 py-1.5 text-xs text-[var(--color-fg-muted)] backdrop-blur transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]",
        active && "border-[var(--color-accent)] text-[var(--color-fg)] ring-accent-glow",
        className,
      )}
      title="Hold to view original (B to toggle)"
    >
      <Eye className="h-3.5 w-3.5" />
      {active ? "Before" : "After"}
    </button>
  );
}
