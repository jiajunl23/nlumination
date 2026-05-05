"use client";

/**
 * Gallery card.
 *
 * Critical (do not change without good reason):
 *  - The <canvas> + Pipeline integration. Each card spins up a tiny WebGL
 *    pipeline, applies the saved GradingParams to the thumbnail, and
 *    renders into the canvas. setImage / setParams / fitCanvas / render
 *    are all required calls in that exact order.
 *  - The <Link href={`/editor?photoId=${id}`}> click target — that's the
 *    "open this photo in the editor" entry point for the whole app.
 *  - The onDelete wiring — parent owns optimistic state.
 *
 * Visual goals:
 *  - Pinterest / Apple-Photos polish: lifted hover, gradient scrim that
 *    reveals filename + dims, larger tap-friendly delete button.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Pipeline } from "@/lib/webgl/pipeline";
import type { GradingParams } from "@/lib/grading/params";
import styles from "./gallery.module.css";

type Props = {
  id: string;
  filename: string;
  thumbUrl: string;
  width: number;
  height: number;
  params: GradingParams;
  onDelete?: (id: string) => void;
};

export function PhotoCard({
  id,
  filename,
  thumbUrl,
  width,
  height,
  params,
  onDelete,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    let aborted = false;
    let pipeline: Pipeline | null = null;

    (async () => {
      try {
        pipeline = new Pipeline(canvasRef.current!);
        pipelineRef.current = pipeline;
        const blob = await fetch(thumbUrl).then((r) => r.blob());
        const bmp = await createImageBitmap(blob);
        if (aborted) {
          bmp.close();
          return;
        }
        pipeline.setImage(bmp);
        pipeline.setParams(params);
        pipeline.fitCanvas();
        pipeline.render();
        setLoaded(true);
      } catch (err) {
        console.error("PhotoCard render", err);
      }
    })();

    return () => {
      aborted = true;
      pipeline?.dispose();
      pipelineRef.current = null;
    };
  }, [thumbUrl, params]);

  const aspect = width / Math.max(1, height);
  const dims = `${width} × ${height}`;

  return (
    <div className={styles.cardShell}>
      <Link
        href={`/editor?photoId=${id}`}
        className="relative block"
        style={{ aspectRatio: aspect }}
        aria-label={`Open "${filename}" in editor`}
      >
        {/* Skeleton shimmer behind the canvas while the pipeline initialises */}
        {!loaded && (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(110deg,var(--color-bg-elev-2)_30%,var(--color-bg-elev-3)_50%,var(--color-bg-elev-2)_70%)] bg-[length:200%_100%] motion-safe:animate-pulse"
          />
        )}
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          style={{ opacity: loaded ? 1 : 0, transition: "opacity 220ms ease" }}
        />

        {/* Hover scrim with metadata reveal — pinned to the same Link
            target so the whole card stays clickable. */}
        <div className={styles.metaScrim}>
          <div className={styles.metaTitle}>{filename}</div>
          <div className={styles.metaRow}>
            <span>{dims}</span>
            <span className={styles.metaDot} aria-hidden="true" />
            <span>Click to refine</span>
          </div>
        </div>
      </Link>

      {onDelete && (
        <button
          type="button"
          className={styles.deleteBtn}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm(`Delete "${filename}"?`)) onDelete(id);
          }}
          aria-label={`Delete ${filename}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
