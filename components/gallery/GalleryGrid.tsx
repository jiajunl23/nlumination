"use client";

/**
 * Masonry gallery — every card is the same uniform size in its column.
 *
 * Layout decisions:
 *  - Masonry via CSS multi-column (`column-count` in gallery.module.css)
 *    so portrait + landscape thumbs pack tightly without gaps. We rely
 *    on `break-inside: avoid` on each card.
 *  - No featured-first hero — the most recent photo packs into the
 *    masonry with everyone else (the user prefers uniform sizing over
 *    a giant hero card).
 *  - Empty state has its own illustrative orb (see gallery.module.css)
 *    plus a primary CTA to the editor.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ImageIcon, Plus, Sparkles } from "lucide-react";
import { PhotoCard } from "./PhotoCard";
import type { GradingParams } from "@/lib/grading/params";
import styles from "./gallery.module.css";

type Photo = {
  id: string;
  filename: string;
  thumbUrl: string;
  width: number;
  height: number;
  params: GradingParams;
};

export function GalleryGrid({ initial }: { initial: Photo[] }) {
  const [photos, setPhotos] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async (id: string) => {
    setError(null);
    const prev = photos;
    setPhotos(photos.filter((p) => p.id !== id));
    try {
      const r = await fetch(`/api/photos/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`delete ${r.status}`);
    } catch (err) {
      setPhotos(prev);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (photos.length === 0) {
    return (
      <div className={styles.emptyShell}>
        <div className={styles.emptyOrbWrap} aria-hidden="true">
          <div className={styles.emptyOrb} />
          <div className={styles.emptyFrame}>
            <ImageIcon className="h-8 w-8" />
          </div>
        </div>
        <h2 className="mb-2 text-lg font-medium tracking-tight text-[var(--color-fg)]">
          Your gallery is waiting
        </h2>
        <p className="mx-auto mb-6 max-w-sm text-sm text-[var(--color-fg-muted)]">
          Upload a photo, describe the mood you want, and save the look.
          Everything you grade lands here for instant re-editing.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/editor"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-fg)] px-5 py-2 text-sm font-medium text-[var(--color-bg)] transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Open the editor
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev-1)] px-3 py-1.5 text-xs text-[var(--color-fg-muted)]">
            <Sparkles className="h-3 w-3 text-[var(--color-accent)]" />
            Try “moody, blue shadows, protect highlights”
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {error}
        </div>
      )}

      <div className={styles.masonry}>
        {photos.map((p) => (
          <PhotoCard key={p.id} {...p} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}
