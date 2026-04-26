/**
 * Tone-curve sampling. The shader reads a 256×1 RGBA8 texture where
 *   R, G, B = per-channel curves (unused in v1, identity)
 *   A      = the master luminance/RGB curve
 *
 * Curve points are 0..1 in both axes. Endpoints (0,0) and (1,1) are added
 * implicitly if the user hasn't supplied them.
 *
 * Interpolation is monotone Catmull-Rom — gives smooth S-curves without the
 * overshoot you get from raw cubic Hermite when the user drags a steep edit.
 */

import type { CurvePoint } from "./params";

export function buildCurveLut(points: CurvePoint[]): Uint8Array {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (sorted.length === 0 || sorted[0].x > 0) sorted.unshift({ x: 0, y: 0 });
  if (sorted[sorted.length - 1].x < 1) sorted.push({ x: 1, y: 1 });

  const out = new Uint8Array(256 * 4);

  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    const y = sampleMonotoneCurve(sorted, x);
    const v = Math.round(Math.min(1, Math.max(0, y)) * 255);
    // R/G/B identity, A = master curve.
    out[i * 4 + 0] = i;
    out[i * 4 + 1] = i;
    out[i * 4 + 2] = i;
    out[i * 4 + 3] = v;
  }
  return out;
}

function sampleMonotoneCurve(points: CurvePoint[], x: number): number {
  if (x <= points[0].x) return points[0].y;
  if (x >= points[points.length - 1].x) return points[points.length - 1].y;

  let i = 0;
  while (i < points.length - 1 && points[i + 1].x < x) i++;

  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(points.length - 1, i + 2)];

  const t = (x - p1.x) / (p2.x - p1.x || 1e-6);

  // Monotone Catmull-Rom (Steffen's method, simplified).
  const m1 = secant(p1, p2);
  const m0 = i === 0 ? m1 : harmonicAverage(secant(p0, p1), m1);
  const m2 = i === points.length - 2 ? m1 : harmonicAverage(m1, secant(p2, p3));

  const dx = p2.x - p1.x;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 =  2 * t3 - 3 * t2 + 1;
  const h10 =      t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 =      t3 -     t2;
  return h00 * p1.y + h10 * dx * m0 + h01 * p2.y + h11 * dx * m2;
}

function secant(a: CurvePoint, b: CurvePoint) {
  const dx = b.x - a.x;
  return dx === 0 ? 0 : (b.y - a.y) / dx;
}

function harmonicAverage(a: number, b: number) {
  if (a * b <= 0) return 0;
  return (2 * a * b) / (a + b);
}
