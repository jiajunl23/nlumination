"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Pipeline } from "@/lib/webgl/pipeline";
import type { GradingParams } from "@/lib/grading/params";

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

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[--color-border] bg-[--color-bg-elev-2] transition hover:border-[--color-border-strong]">
      <Link
        href={`/editor?photoId=${id}`}
        className="block"
        style={{ aspectRatio: aspect }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          style={{ opacity: loaded ? 1 : 0, transition: "opacity 200ms" }}
        />
      </Link>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-xs">
        <span className="truncate text-[--color-fg-muted]">{filename}</span>
        {onDelete && (
          <button
            type="button"
            className="pointer-events-auto rounded-full p-1 text-[--color-fg-muted] opacity-0 transition group-hover:opacity-100 hover:text-red-300"
            onClick={(e) => {
              e.preventDefault();
              if (confirm(`Delete "${filename}"?`)) onDelete(id);
            }}
            aria-label="Delete photo"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
