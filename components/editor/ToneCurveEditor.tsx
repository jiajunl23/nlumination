"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { CurvePoint } from "@/lib/grading/params";
import { buildCurveLut } from "@/lib/grading/curve";
import { clamp } from "@/lib/utils";

type Props = {
  points: CurvePoint[];
  onChange: (next: CurvePoint[]) => void;
};

const SIZE = 160;
const PAD = 6;
const INNER = SIZE - PAD * 2;

export function ToneCurveEditor({ points, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Pre-sample the curve through the same monotone-Catmull-Rom path the
  // shader uses, so what the user sees on this graph is what gets applied.
  const curvePath = useMemo(() => {
    const lut = buildCurveLut(points);
    let d = "";
    for (let i = 0; i < 256; i++) {
      const x = PAD + (i / 255) * INNER;
      const y = PAD + (1 - lut[i * 4 + 3] / 255) * INNER;
      d += i === 0 ? `M${x.toFixed(1)} ${y.toFixed(1)}` : ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  }, [points]);

  const sorted = useMemo(
    () => [...points].sort((a, b) => a.x - b.x),
    [points],
  );

  const toLocal = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const xRaw = ((clientX - rect.left) / rect.width) * SIZE;
    const yRaw = ((clientY - rect.top) / rect.height) * SIZE;
    return {
      x: clamp((xRaw - PAD) / INNER, 0, 1),
      y: clamp(1 - (yRaw - PAD) / INNER, 0, 1),
    };
  }, []);

  const handlePointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragIdx(idx);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIdx == null) return;
    const next = [...points];
    const { x, y } = toLocal(e.clientX, e.clientY);
    // Endpoints stay pinned on x.
    if (dragIdx === 0) next[0] = { x: 0, y };
    else if (dragIdx === points.length - 1)
      next[points.length - 1] = { x: 1, y };
    else next[dragIdx] = { x, y };
    onChange(next);
  };

  const handlePointerUp = () => setDragIdx(null);

  // Click on the curve adds a new control point.
  const addPoint = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragIdx != null) return;
    const { x, y } = toLocal(e.clientX, e.clientY);
    const next = [...points, { x, y }].sort((a, b) => a.x - b.x);
    onChange(next);
  };

  const removePoint = (idx: number) => {
    if (idx === 0 || idx === points.length - 1) return;
    onChange(points.filter((_, i) => i !== idx));
  };

  return (
    <div className="rounded-lg border border-[--color-border] bg-[--color-bg-elev-2]/60 p-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block w-full select-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={addPoint}
      >
        {/* Grid */}
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g}>
            <line
              x1={PAD + g * INNER}
              y1={PAD}
              x2={PAD + g * INNER}
              y2={PAD + INNER}
              stroke="var(--color-border)"
              strokeWidth={0.5}
            />
            <line
              x1={PAD}
              y1={PAD + g * INNER}
              x2={PAD + INNER}
              y2={PAD + g * INNER}
              stroke="var(--color-border)"
              strokeWidth={0.5}
            />
          </g>
        ))}
        {/* 1:1 reference */}
        <line
          x1={PAD}
          y1={PAD + INNER}
          x2={PAD + INNER}
          y2={PAD}
          stroke="var(--color-border-strong)"
          strokeDasharray="2 3"
          strokeWidth={0.6}
        />
        {/* Frame */}
        <rect
          x={PAD}
          y={PAD}
          width={INNER}
          height={INNER}
          fill="none"
          stroke="var(--color-border-strong)"
          strokeWidth={0.6}
        />
        {/* Curve */}
        <path
          d={curvePath}
          fill="none"
          stroke="var(--color-fg)"
          strokeWidth={1.2}
          strokeLinecap="round"
        />
        {/* Control points */}
        {sorted.map((p, i) => {
          const cx = PAD + p.x * INNER;
          const cy = PAD + (1 - p.y) * INNER;
          // Lookup the original index in the unsorted array
          const origIdx = points.indexOf(p);
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={4.5}
              fill="var(--color-bg)"
              stroke="var(--color-fg)"
              strokeWidth={1.2}
              className="cursor-grab"
              onPointerDown={handlePointerDown(origIdx)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                removePoint(origIdx);
              }}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between px-1 text-[10px] text-[--color-fg-dim]">
        <span>Double-click curve to add · point to remove</span>
      </div>
    </div>
  );
}
