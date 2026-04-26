"use client";

import { useState } from "react";
import { Sparkles, Send, Lightbulb } from "lucide-react";
import { CHIPS } from "@/lib/nlp/chips";
import { parsePrompt } from "@/lib/nlp/parser";
import { suggestForUnmatched } from "@/lib/nlp/fallback";
import type { GradingParams } from "@/lib/grading/params";
import { cn } from "@/lib/utils";

type Props = {
  params: GradingParams;
  onParams: (next: GradingParams) => void;
  className?: string;
};

export function PromptBar({ params, onParams, className }: Props) {
  const [value, setValue] = useState("");
  const [understood, setUnderstood] = useState<{ phrase: string; description: string }[]>([]);
  const [suggestions, setSuggestions] = useState<
    { phrase: string; description: string }[]
  >([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);

  const submit = (text: string) => {
    if (!text.trim()) return;
    const result = parsePrompt(text, params);
    onParams(result.params);
    setUnderstood(result.understood);
    setUnmatched(result.unmatched);
    setSuggestions(
      result.understood.length === 0 || result.unmatched.length > 0
        ? suggestForUnmatched(result.unmatched.length ? result.unmatched : [text])
        : [],
    );
    setValue("");
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className={cn(
          "group flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev-2)]/60 px-3 py-2 backdrop-blur transition focus-within:border-[var(--color-border-strong)]",
        )}
      >
        <Sparkles className="h-4 w-4 text-[var(--color-accent)]" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder='e.g. "moody, blue shadows, protect highlights"'
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-dim)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="rounded-full bg-[var(--color-fg)] p-1.5 text-[var(--color-bg)] transition disabled:pointer-events-none disabled:opacity-30 hover:opacity-90"
          aria-label="Apply prompt"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-thin sm:flex-wrap sm:overflow-visible sm:pb-0">
        {CHIPS.map((chip) => (
          <button
            key={chip.label}
            onClick={() => submit(chip.prompt)}
            className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev-1)] px-3 py-1 text-xs text-[var(--color-fg-muted)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-elev-2)] hover:text-[var(--color-fg)]"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {(understood.length > 0 || unmatched.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-[var(--color-fg-muted)]">
          {understood.length > 0 && (
            <>
              <span className="text-[var(--color-fg-dim)]">understood:</span>
              {understood.map((u, i) => (
                <span
                  key={i}
                  className="rounded-md bg-[var(--color-bg-elev-3)] px-1.5 py-0.5 text-[var(--color-fg)]"
                >
                  {u.description}
                </span>
              ))}
            </>
          )}
          {unmatched.length > 0 && (
            <>
              <span className="ml-2 text-[var(--color-fg-dim)]">skipped:</span>
              {unmatched.map((u, i) => (
                <span
                  key={i}
                  className="rounded-md border border-dashed border-[var(--color-border-strong)] px-1.5 py-0.5 text-[var(--color-fg-dim)]"
                >
                  {u}
                </span>
              ))}
            </>
          )}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-bg-elev-1)] px-2 py-2 text-[11px] text-[var(--color-fg-muted)]">
          <Lightbulb className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          <span className="text-[var(--color-fg-dim)]">try:</span>
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => submit(s.phrase)}
              className="rounded-md bg-[var(--color-bg-elev-3)] px-1.5 py-0.5 text-[var(--color-fg)] transition hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)]"
            >
              {s.phrase}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
