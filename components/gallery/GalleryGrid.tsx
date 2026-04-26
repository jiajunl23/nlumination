"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PhotoCard } from "./PhotoCard";
import type { GradingParams } from "@/lib/grading/params";

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
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[--color-border-strong] bg-[--color-bg-elev-1] py-24 text-center">
        <div className="text-sm text-[--color-fg-muted]">
          No saved edits yet.
        </div>
        <Link
          href="/editor"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[--color-fg] px-4 py-2 text-xs font-medium text-[--color-bg] transition hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Open the editor
        </Link>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => (
          <PhotoCard key={p.id} {...p} onDelete={onDelete} />
        ))}
      </div>
    </>
  );
}
