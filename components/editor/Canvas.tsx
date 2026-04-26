"use client";

import { useEffect, useImperativeHandle, useRef } from "react";
import type { GradingParams } from "@/lib/grading/params";
import { Pipeline } from "@/lib/webgl/pipeline";
import type { CubeLut } from "@/lib/webgl/lut-loader";

export type CanvasHandle = {
  setLut: (lut: CubeLut | null) => void;
  exportBlob: (mime?: string, quality?: number) => Promise<Blob>;
};

type Props = {
  ref?: React.Ref<CanvasHandle>;
  source: ImageBitmap | HTMLImageElement | null;
  params: GradingParams;
  className?: string;
  onError?: (err: Error) => void;
};

export function Canvas({ ref, source, params, className, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const rafRef = useRef<number | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useImperativeHandle(ref, () => ({
    setLut(lut) {
      pipelineRef.current?.setLut(lut);
      schedule();
    },
    async exportBlob(mime, quality) {
      if (!pipelineRef.current) throw new Error("Canvas not ready");
      return pipelineRef.current.exportBlob(mime, quality);
    },
  }));

  const schedule = () => {
    console.log("[debug] schedule called", { pending: rafRef.current != null });
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      console.log("[debug] rAF fired");
      rafRef.current = null;
      pipelineRef.current?.render();
    });
  };

  // Init / dispose pipeline
  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      pipelineRef.current = new Pipeline(canvasRef.current);
    } catch (err) {
      onErrorRef.current?.(err as Error);
      return;
    }

    const ro = new ResizeObserver(() => {
      pipelineRef.current?.fitCanvas();
      schedule();
    });
    ro.observe(canvasRef.current);

    return () => {
      ro.disconnect();
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pipelineRef.current?.dispose();
      pipelineRef.current = null;
    };
  }, []);

  // Feed source whenever pipeline is (re)created or source changes.
  // Runs after the init effect on the same mount, so pipelineRef is current.
  useEffect(() => {
    if (!source || !pipelineRef.current) return;
    pipelineRef.current.setImage(source);
    schedule();
  }, [source]);

  // React to params changes
  useEffect(() => {
    if (!pipelineRef.current) return;
    pipelineRef.current.setParams(params);
    schedule();
  }, [params]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
