"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  /** True for sliders centered at 0 (e.g. exposure ±). */
  bipolar?: boolean;
  /** When true, label and value sit on one row (compact). */
  dense?: boolean;
  /** Custom value formatter. */
  format?: (v: number) => string;
  className?: string;
  onChange: (v: number) => void;
  /** Called when the user releases the slider — useful for committing history. */
  onCommit?: (v: number) => void;
};

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue,
  bipolar,
  dense = true,
  format,
  className,
  onChange,
  onCommit,
}: Props) {
  const id = useId();
  const display = format ? format(value) : Number.isInteger(step)
    ? Math.round(value).toString()
    : value.toFixed(2);

  // Fill-indicator geometry — for bipolar sliders we draw from the centre
  // outwards; for unipolar from the left.
  const range = max - min;
  const pct = ((value - min) / range) * 100;
  let fillLeft = 0;
  let fillWidth = pct;
  if (bipolar) {
    const zero = ((0 - min) / range) * 100;
    if (pct >= zero) {
      fillLeft = zero;
      fillWidth = pct - zero;
    } else {
      fillLeft = pct;
      fillWidth = zero - pct;
    }
  }

  return (
    <div className={cn("group/slider", className)}>
      <div
        className={cn(
          "flex items-center justify-between text-xs",
          dense ? "mb-0.5" : "mb-1.5",
        )}
      >
        <label
          htmlFor={id}
          className="text-[var(--color-fg-muted)] transition group-hover/slider:text-[var(--color-fg)]"
        >
          {label}
        </label>
        <button
          type="button"
          onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
          className="font-mono tabular-nums text-[var(--color-fg)] transition hover:text-[var(--color-accent)]"
          title="Double-click to reset"
        >
          {display}
        </button>
      </div>

      <div className="relative h-[18px]">
        {/* Track */}
        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-[var(--color-border-strong)]" />
        {/* Fill */}
        <div
          className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-[var(--color-accent)] transition-[background] group-hover/slider:bg-[var(--color-accent-glow)]"
          style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
        />
        {/* Native range input on top — invisible track but usable thumb */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onPointerUp={() => onCommit?.(value)}
          onKeyUp={() => onCommit?.(value)}
          className="absolute inset-0 w-full"
          style={{ background: "transparent" }}
        />
      </div>
    </div>
  );
}
