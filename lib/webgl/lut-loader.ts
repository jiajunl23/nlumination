/**
 * Adobe / IRIDAS .cube 3D LUT parser.
 *
 * Spec covered:
 *   LUT_3D_SIZE N      — N-cubed grid (typically 32 or 64)
 *   DOMAIN_MIN x y z   — input domain min (default 0 0 0)
 *   DOMAIN_MAX x y z   — input domain max (default 1 1 1)
 *   data: N^3 lines, "r g b", in B-major then G-major then R-major order.
 *
 * Returns a Float32Array sized N×N×N×3 ready for `gl.texImage3D` with
 * internalFormat RGB16F / format RGB / type FLOAT.
 */

export type CubeLut = {
  size: number;
  domain: { min: [number, number, number]; max: [number, number, number] };
  data: Float32Array; // length = size^3 * 3
};

export function parseCube(text: string): CubeLut {
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];

  const lines = text.split(/\r?\n/);
  const data: number[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("TITLE")) continue;
    if (line.startsWith("LUT_1D_SIZE")) {
      throw new Error(".cube: 1D LUTs are not supported");
    }
    if (line.startsWith("LUT_3D_SIZE")) {
      size = Number(line.split(/\s+/)[1]);
      continue;
    }
    if (line.startsWith("DOMAIN_MIN")) {
      const parts = line.split(/\s+/).slice(1).map(Number);
      domainMin = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
      continue;
    }
    if (line.startsWith("DOMAIN_MAX")) {
      const parts = line.split(/\s+/).slice(1).map(Number);
      domainMax = [parts[0] ?? 1, parts[1] ?? 1, parts[2] ?? 1];
      continue;
    }
    const nums = line.split(/\s+/).map(Number);
    if (nums.length === 3 && nums.every((n) => Number.isFinite(n))) {
      data.push(nums[0], nums[1], nums[2]);
    }
  }

  if (!size) throw new Error(".cube: missing LUT_3D_SIZE");
  const expected = size * size * size * 3;
  if (data.length !== expected) {
    throw new Error(
      `.cube: expected ${expected / 3} samples, got ${data.length / 3}`,
    );
  }

  return {
    size,
    domain: { min: domainMin, max: domainMax },
    data: new Float32Array(data),
  };
}

export async function fetchCubeLut(url: string): Promise<CubeLut> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetchCubeLut: ${url} → ${res.status}`);
  return parseCube(await res.text());
}
