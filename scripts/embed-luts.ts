/**
 * Embed every LUT's description + tag-bag into a 384-d vector and write
 * back into public/luts/manifest.json.
 *
 *   pnpm tsx scripts/embed-luts.ts
 *
 * Idempotent: re-runs replace existing embeddings. Cheap (free HF API);
 * a full re-embed of 137 entries takes ~5-15 s when the model is warm
 * and ~30-60 s on a cold model (first call after idle).
 *
 * The "what gets embedded" is intentionally short — `description` plus
 * the first 8 tags joined. Long bodies dilute the embedding's locality;
 * a tag bag is what keeps "TealOrange" cosine-near "cinematic blockbuster
 * teal-orange Hollywood" in user queries.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { readFileSync, writeFileSync } from "node:fs";
import { embedBatch, EMBEDDING_MODEL, EMBEDDING_DIM } from "../lib/nlp/embedding";

const MANIFEST_PATH = "public/luts/manifest.json";

interface ManifestLut {
  id: string;
  description: string;
  tags: string[];
  embedding?: number[];
}

interface Manifest {
  version: number;
  generatedAt: string;
  luts: ManifestLut[];
  // appended by us:
  embeddingModel?: string;
  embeddingDim?: number;
  embeddingsGeneratedAt?: string;
  [k: string]: unknown;
}

function buildEmbeddingText(l: ManifestLut): string {
  const tags = l.tags.slice(0, 10).join(", ");
  return `${l.description} Tags: ${tags}.`;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  const luts = manifest.luts;
  const texts = luts.map(buildEmbeddingText);

  // Voyage's free-without-billing tier is 3 RPM / 10K TPM. Each LUT
  // description is ~30 tokens, so 137 × 30 ≈ 4K tokens fits in a single
  // request comfortably. Pack everything into one call to avoid RPM cap.
  // (If batch > Voyage's 128-input limit ever bites, drop BATCH and add a
  // 22 s sleep between requests to stay ≤ 3 RPM.)
  const BATCH = 128; // Voyage's per-request input cap
  const all: number[][] = [];
  console.log(`Embedding ${texts.length} LUT descriptions via ${EMBEDDING_MODEL}…`);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // First request after a previous run that hit 429 needs a clean RPM
  // window — Voyage uses a sliding 60s window. Pre-pause 65s to clear it.
  process.stdout.write("  (initial 65s pause to clear any prior RPM window)\n");
  await sleep(65_000);

  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const lo = i + 1;
    const hi = Math.min(i + BATCH, texts.length);
    if (i > 0) {
      // Stay under 3 RPM (free-without-billing tier): 22s gap.
      process.stdout.write(`  (sleep 22s for free-tier RPM)\n`);
      await sleep(22_000);
    }
    process.stdout.write(`  [${lo}-${hi}/${texts.length}]…`);
    const t0 = Date.now();
    const out = await embedBatch(slice);
    const dt = Date.now() - t0;
    process.stdout.write(` OK (${dt}ms)\n`);
    if (out.length !== slice.length) {
      throw new Error(
        `batch ${lo}-${hi}: got ${out.length} vectors, expected ${slice.length}`,
      );
    }
    for (const v of out) {
      if (!Array.isArray(v) || v.length !== EMBEDDING_DIM) {
        throw new Error(
          `unexpected vector shape: len=${Array.isArray(v) ? v.length : "non-array"}, expected ${EMBEDDING_DIM}`,
        );
      }
      all.push(v);
    }
  }

  for (let i = 0; i < luts.length; i++) {
    luts[i].embedding = all[i];
  }

  manifest.embeddingModel = EMBEDDING_MODEL;
  manifest.embeddingDim = EMBEDDING_DIM;
  manifest.embeddingsGeneratedAt = new Date().toISOString();

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");

  const bytes = readFileSync(MANIFEST_PATH).byteLength;
  console.log(
    `Wrote ${MANIFEST_PATH} — ${luts.length} embeddings × ${EMBEDDING_DIM}-d (${(bytes / 1024).toFixed(1)} KB)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
