import "server-only";

/**
 * Cosine-search the LUT manifest for the top-K candidates given a user
 * prompt + emotion brief.
 *
 * Manifest is loaded once per server process (137 entries × 384-d ≈ 200 KB
 * JSON load — well within the cold-start budget). For Vercel functions
 * the module-level cache means subsequent requests on the same instance
 * hit memory.
 *
 * Failure modes are non-fatal: if the embedding API errors or the
 * manifest is missing, we return [] and let A3 run without LUT seeds.
 * That degrades gracefully — A3 still produces a slider delta.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { embed } from "./embedding";

export interface LutCandidate {
  id: string;
  filename: string;
  description: string;
  category: string;
  tags: string[];
  /** cosine similarity in [-1, 1]; closer to 1 = more relevant. */
  score: number;
}

interface ManifestLut {
  id: string;
  filename: string;
  description: string;
  category: string;
  tags: string[];
  embedding?: number[];
}

interface Manifest {
  luts: ManifestLut[];
  embeddingDim?: number;
}

interface CachedManifest {
  luts: ManifestLut[];
  embeddingDim: number;
  // Pre-computed L2 norm of each embedding so cosine reduces to dot/norm.
  norms: Float32Array;
  // Flat Float32 buffer (lutCount × dim) for cache-friendly cosine.
  flat: Float32Array;
}

let cache: CachedManifest | null = null;
let loadError: string | null = null;

function loadManifest(): CachedManifest | null {
  if (cache) return cache;
  if (loadError) return null;
  try {
    const path = join(process.cwd(), "public/luts/manifest.json");
    const m = JSON.parse(readFileSync(path, "utf8")) as Manifest;
    const dim = m.embeddingDim ?? 0;
    if (!dim) {
      loadError = "manifest missing embeddingDim — run `tsx scripts/embed-luts.ts`";
      return null;
    }
    const withEmb = m.luts.filter((l) => Array.isArray(l.embedding) && l.embedding.length === dim);
    if (withEmb.length === 0) {
      loadError = "manifest has no LUT embeddings — run `tsx scripts/embed-luts.ts`";
      return null;
    }
    const flat = new Float32Array(withEmb.length * dim);
    const norms = new Float32Array(withEmb.length);
    for (let i = 0; i < withEmb.length; i++) {
      const v = withEmb[i].embedding!;
      let n2 = 0;
      for (let j = 0; j < dim; j++) {
        flat[i * dim + j] = v[j];
        n2 += v[j] * v[j];
      }
      norms[i] = Math.sqrt(n2);
    }
    cache = { luts: withEmb, embeddingDim: dim, norms, flat };
    return cache;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

function cosine(query: number[], idx: number, c: CachedManifest): number {
  const d = c.embeddingDim;
  let dot = 0;
  let qn2 = 0;
  for (let j = 0; j < d; j++) {
    const q = query[j];
    dot += q * c.flat[idx * d + j];
    qn2 += q * q;
  }
  const qn = Math.sqrt(qn2);
  const dn = c.norms[idx];
  if (qn === 0 || dn === 0) return 0;
  return dot / (qn * dn);
}

/**
 * Retrieve the top-K LUTs whose description+tags are most similar to the
 * given query. Returns [] (rather than throwing) on any failure so the
 * agents pipeline degrades to slider-only.
 *
 * `query` should be the raw user prompt, optionally concatenated with
 * the A1 emotion brief — both signals matter and combining them improves
 * retrieval recall.
 */
export async function retrieveLuts(
  query: string,
  k = 3,
): Promise<LutCandidate[]> {
  const c = loadManifest();
  if (!c) {
    if (loadError) console.warn(`[lut-retrieve] manifest unusable: ${loadError}`);
    return [];
  }
  let qVec: number[];
  try {
    qVec = await embed(query);
  } catch (err) {
    console.warn(
      `[lut-retrieve] embedding failed (returning no candidates): ${err instanceof Error ? err.message : err}`,
    );
    return [];
  }

  const scored: { idx: number; score: number }[] = [];
  for (let i = 0; i < c.luts.length; i++) {
    scored.push({ idx: i, score: cosine(qVec, i, c) });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, k);
  return top.map(({ idx, score }) => {
    const l = c.luts[idx];
    return {
      id: l.id,
      filename: l.filename,
      description: l.description,
      category: l.category,
      tags: l.tags,
      score,
    };
  });
}

/** Strict variant for diagnostics: throws if no embeddings or API fails. */
export async function retrieveLutsStrict(
  query: string,
  k = 3,
): Promise<LutCandidate[]> {
  const c = loadManifest();
  if (!c) {
    throw new Error(loadError ?? "manifest not loaded");
  }
  const qVec = await embed(query);
  const scored: { idx: number; score: number }[] = [];
  for (let i = 0; i < c.luts.length; i++) {
    scored.push({ idx: i, score: cosine(qVec, i, c) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(({ idx, score }) => {
    const l = c.luts[idx];
    return {
      id: l.id,
      filename: l.filename,
      description: l.description,
      category: l.category,
      tags: l.tags,
      score,
    };
  });
}

export function manifestLoadError(): string | null {
  loadManifest();
  return loadError;
}
