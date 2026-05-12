"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, X, Eye, EyeOff, Check, AlertTriangle } from "lucide-react";
import { useGroqApiKey } from "@/lib/nlp/useGroqApiKey";
import { isValidGroqKey } from "@/lib/nlp/groq-key";
import { cn } from "@/lib/utils";

type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok" }
  | { kind: "err"; message: string };

/**
 * Header-mounted popover for managing a user-supplied Groq API key.
 *
 * Sits next to the ModeToggle in ChatPanel. Stores the key in
 * localStorage via useGroqApiKey(); the actual transmission to the
 * server happens via the X-Groq-Key header in callLLM().
 *
 * UX:
 * - Closed: a key-icon pill labelled "Your key" (filled accent) when
 *   a key is set, or "BYO key" (idle) when not. Switched away from a
 *   generic gear icon because users couldn't tell the trigger from a
 *   settings button.
 * - Open: input + Show/Hide + Test + Save + Clear, plus a security
 *   note explaining where the key goes.
 */
export function SettingsPopover() {
  const { apiKey, hasKey, save, clear } = useGroqApiKey();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const ref = useRef<HTMLDivElement>(null);

  // Sync the input when the popover opens (or saved key changes
  // externally — e.g. cleared in another tab).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setDraft(apiKey ?? "");
  }, [open, apiKey]);

  // Click-outside / escape to close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const draftValid = isValidGroqKey(draft);
  const draftChanged = draft !== (apiKey ?? "");

  const runTest = async () => {
    if (!draftValid) return;
    setTest({ kind: "running" });
    try {
      const res = await fetch("/api/nlp/test-key", {
        method: "POST",
        headers: { "X-Groq-Key": draft },
      });
      if (res.ok) {
        setTest({ kind: "ok" });
      } else {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setTest({
          kind: "err",
          message: body?.error ?? `HTTP ${res.status}`,
        });
      }
    } catch {
      setTest({ kind: "err", message: "Network error" });
    }
  };

  const handleSave = () => {
    if (!draftValid) return;
    save(draft);
    setTest({ kind: "idle" });
  };

  const handleClear = () => {
    clear();
    setDraft("");
    setTest({ kind: "idle" });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-medium transition",
          hasKey
            ? "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
            : "border-[var(--color-border)] bg-[var(--color-bg-elev-2)]/60 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
        )}
        title={
          hasKey
            ? "Using your Groq key — unlimited daily quota. Click to manage."
            : "Bring your own Groq key to bypass the shared 100/day quota"
        }
        aria-label={hasKey ? "Manage your Groq key" : "Bring your own Groq key"}
        aria-expanded={open}
      >
        <KeyRound className="h-3.5 w-3.5" />
        <span>{hasKey ? "Your key" : "BYO key"}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-9 z-30 w-80 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev-1)] p-3 shadow-2xl"
          role="dialog"
          aria-label="API key settings"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium text-[var(--color-fg)]">
              Bring your own Groq key
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[var(--color-fg-dim)] hover:text-[var(--color-fg)]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-2 text-[11px] leading-snug text-[var(--color-fg-dim)]">
            With your own key, requests bypass our shared 100/day quota.
            Your key is stored locally in this browser and sent to our
            server only as a request header. We do not log or persist it.
          </p>

          <div className="mb-2 flex items-stretch gap-1">
            <input
              type={reveal ? "text" : "password"}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (test.kind !== "idle") setTest({ kind: "idle" });
              }}
              placeholder="gsk_..."
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev-2)]/60 px-2 py-1 text-xs text-[var(--color-fg)] placeholder:text-[var(--color-fg-dim)] focus:border-[var(--color-border-strong)] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev-2)]/60 px-2 text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
              aria-label={reveal ? "Hide key" : "Show key"}
              title={reveal ? "Hide" : "Show"}
            >
              {reveal ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {draft.length > 0 && !draftValid && (
            <div className="mb-2 flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)]">
              <AlertTriangle className="h-3 w-3" />
              Format must match{" "}
              <code className="rounded bg-[var(--color-bg-elev-2)] px-1 text-[10px]">
                gsk_…
              </code>{" "}
              with at least 24 characters.
            </div>
          )}

          {test.kind === "ok" && (
            <div className="mb-2 flex items-center gap-1 text-[11px] text-emerald-500">
              <Check className="h-3 w-3" />
              Key works.
            </div>
          )}
          {test.kind === "err" && (
            <div className="mb-2 flex items-center gap-1 text-[11px] text-red-500">
              <AlertTriangle className="h-3 w-3" />
              {test.message}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={runTest}
              disabled={!draftValid || test.kind === "running"}
              className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev-2)]/60 px-2 py-1 text-[11px] text-[var(--color-fg)] transition hover:border-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {test.kind === "running" ? "Testing…" : "Test"}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!draftValid || !draftChanged}
              className="flex-1 rounded-md border border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 px-2 py-1 text-[11px] font-medium text-[var(--color-accent)] transition hover:bg-[var(--color-accent)]/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
            {hasKey && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev-2)]/60 px-2 py-1 text-[11px] text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
                title="Forget this key on this device"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
