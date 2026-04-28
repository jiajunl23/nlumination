"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send } from "lucide-react";
import { CHIPS } from "@/lib/nlp/chips";
import { parsePrompt } from "@/lib/nlp/parser";
import { suggestForUnmatched } from "@/lib/nlp/fallback";
import { suggestionFor, summarizeApplied } from "@/lib/nlp/summary";
import type { GradingParams } from "@/lib/grading/params";
import type { ImageStats } from "@/lib/grading/imageStats";
import { cn } from "@/lib/utils";

type Message =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      applied: string[];
      hint?: string;
      tryChips?: { phrase: string; description: string }[];
    };

type Props = {
  params: GradingParams;
  onParams: (next: GradingParams) => void;
  /**
   * Photo statistics fed into the parser so prompts adapt to the actual
   * image (e.g. "brighten" is gentle on bright photos, strong on dark ones).
   * Null until the photo has loaded and stats have been computed.
   */
  stats?: ImageStats | null;
  /**
   * Bumped by the parent whenever the surrounding layout (e.g. the
   * collapsible Adjustments panel) changes height. The chat list pins its
   * scroll to the bottom afterward so the latest message stays visible.
   */
  layoutNonce?: number;
  className?: string;
};

export function ChatPanel({ params, onParams, stats, layoutNonce, className }: Props) {
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const statsRef = useRef(stats);
  statsRef.current = stats;

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  // When the surrounding layout shifts (e.g. Adjustments expands), wait for
  // the max-height transition (~500ms) and re-pin to the bottom so the
  // latest message doesn't get hidden behind the newly-grown panel.
  useEffect(() => {
    if (layoutNonce === undefined) return;
    const t = setTimeout(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 520);
    return () => clearTimeout(t);
  }, [layoutNonce]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const before = paramsRef.current;
    const result = parsePrompt(trimmed, before, statsRef.current);
    onParams(result.params);

    const applied = summarizeApplied(before, result.params, result.understood);
    const hint = suggestionFor(result.understood);
    const tryChips =
      result.understood.length === 0 || result.unmatched.length > 0
        ? suggestForUnmatched(
            result.unmatched.length ? result.unmatched : [trimmed],
          ).slice(0, 4)
        : undefined;

    const ts = Date.now();
    setMessages((m) => [
      ...m,
      { id: `u-${ts}`, role: "user", text: trimmed },
      {
        id: `a-${ts}`,
        role: "assistant",
        applied,
        hint,
        tryChips,
      },
    ]);
    setValue("");
  };

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev-1)]",
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b border-[var(--color-border)]/60 px-4 py-3 text-sm font-medium text-[var(--color-fg)]">
        <Sparkles className="h-4 w-4 text-[var(--color-accent)]" />
        Prompt
      </header>

      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm scrollbar-thin"
        style={{ overflowAnchor: "auto" }}
      >
        {messages.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elev-2)]/40 p-3 text-xs text-[var(--color-fg-muted)]">
            Type a prompt like{" "}
            <span className="text-[var(--color-fg)]">
              &ldquo;moody, blue shadows, protect highlights&rdquo;
            </span>{" "}
            and I&apos;ll move the right sliders for you. You can always fine-tune
            below.
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-[var(--color-bg-elev-3)] px-3 py-2 text-[var(--color-fg)]">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="max-w-[95%] space-y-1.5">
              {m.applied.length > 0 ? (
                <div className="text-[var(--color-fg-muted)]">
                  <span className="text-[var(--color-fg-dim)]">applied:</span>{" "}
                  <span className="text-[var(--color-fg)]">
                    {m.applied.join(", ")}
                  </span>
                </div>
              ) : (
                <div className="text-[var(--color-fg-muted)]">
                  I didn&apos;t recognise anything in that — try one of the chips
                  below or rephrase.
                </div>
              )}
              {m.hint && (
                <div className="text-xs italic text-[var(--color-fg-dim)]">
                  → {m.hint}
                </div>
              )}
              {m.tryChips && m.tryChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {m.tryChips.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => submit(s.phrase)}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] px-2 py-0.5 text-[11px] text-[var(--color-fg)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-elev-3)]"
                    >
                      {s.phrase}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <div className="space-y-2 border-t border-[var(--color-border)]/60 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(value);
          }}
          className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev-2)]/60 px-3 py-2 transition focus-within:border-[var(--color-border-strong)]"
        >
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

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 scrollbar-thin">
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
      </div>
    </div>
  );
}
