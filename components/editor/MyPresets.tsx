"use client";

/**
 * "My looks" — user-saved GradingParams snapshots, listed as pills above
 * the slider sections. Click a pill to load the look, × to delete, or
 * "Save current" to capture the current adjustments under a name.
 *
 * Loading replaces the entire params (full snapshot, not a delta) — the
 * user's intent when saving a "look" is "this exact state, recallable".
 */
import { useEffect, useState } from "react";
import { Plus, X, Check, Bookmark } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import type { GradingParams } from "@/lib/grading/params";

type SavedPreset = {
  id: string;
  name: string;
  params: GradingParams;
  createdAt: string;
};

type Props = {
  params: GradingParams;
  onApply: (next: GradingParams) => void;
};

export function MyPresets({ params, onApply }: Props) {
  const { isSignedIn } = useAuth();
  const [presets, setPresets] = useState<SavedPreset[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    fetch("/api/presets")
      .then((r) => (r.ok ? r.json() : { presets: [] }))
      .then((d) => {
        if (!cancelled) setPresets(d.presets ?? []);
      })
      .catch(() => {
        if (!cancelled) setPresets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  if (!isSignedIn) return null;
  if (presets === null) return null; // loading — render nothing rather than flicker

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, params }),
      });
      if (r.ok) {
        const { preset } = (await r.json()) as { preset: SavedPreset };
        setPresets((p) => [preset, ...(p ?? [])]);
        setName("");
        setNaming(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    // Optimistic — fire and forget. The DB delete is idempotent.
    setPresets((p) => p?.filter((x) => x.id !== id) ?? null);
    fetch(`/api/presets/${id}`, { method: "DELETE" }).catch(() => {});
  };

  return (
    <div className="border-b border-[var(--color-border)]/60 px-4 py-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-[var(--color-fg-muted)]">
          <Bookmark className="h-3 w-3" />
          My looks
        </span>
        {!naming && (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
            title="Save current adjustments as a named look"
          >
            <Plus className="h-3 w-3" />
            Save current
          </button>
        )}
      </div>

      {naming && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="mb-2 flex items-center gap-1.5"
        >
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setNaming(false);
                setName("");
              }
            }}
            placeholder="Look name"
            maxLength={60}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] px-2 py-1 text-xs text-[var(--color-fg)] placeholder:text-[var(--color-fg-dim)] focus:border-[var(--color-border-strong)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="rounded-md bg-[var(--color-fg)] p-1 text-[var(--color-bg)] transition disabled:opacity-30"
            aria-label="Save"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => {
              setNaming(false);
              setName("");
            }}
            className="rounded-md border border-[var(--color-border)] p-1 text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
            aria-label="Cancel"
          >
            <X className="h-3 w-3" />
          </button>
        </form>
      )}

      {presets.length === 0 ? (
        <div className="text-[10px] italic text-[var(--color-fg-dim)]">
          No saved looks yet. Tweak the sliders, then click &ldquo;Save
          current&rdquo; to capture this style.
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] text-xs text-[var(--color-fg)] transition hover:border-[var(--color-border-strong)]"
            >
              <button
                type="button"
                onClick={() => onApply(p.params)}
                className="px-2 py-0.5"
                title={`Apply "${p.name}"`}
              >
                {p.name}
              </button>
              <button
                type="button"
                onClick={() => del(p.id)}
                className="border-l border-[var(--color-border)] px-1 py-0.5 opacity-40 transition hover:opacity-100"
                aria-label={`Delete "${p.name}"`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
