/**
 * Spot-check the LUT retrieval — pick a few canonical queries and
 * print the top-3 cosine matches. No eval grading, just eyeballing
 * whether the manifest embeddings produce sane similarity rankings.
 *
 *   pnpm tsx scripts/smoke-retrieve.ts
 *
 * Voyage's free-without-billing tier is 3 RPM, so we pace 22s between
 * queries.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { retrieveLuts } from "../lib/nlp/lut-retrieve";

const QUERIES = [
  "teal-orange Hollywood blockbuster",
  "moody contemplative foggy night",
  "warm sunset golden hour",
  "make it more cinematic",
  "warmer +5",
  "vintage faded film with lifted blacks",
  "cool nordic icy landscape",
  "Kodak Portra 400 portrait",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    if (i > 0) {
      process.stdout.write(`  (sleep 22s for free-tier RPM)\n`);
      await sleep(22_000);
    }
    console.log(`\n──── "${q}"`);
    const t0 = Date.now();
    const top = await retrieveLuts(q, 3);
    const dt = Date.now() - t0;
    if (top.length === 0) {
      console.log(`  (no candidates)`);
      continue;
    }
    for (const c of top) {
      console.log(
        `  ${c.score.toFixed(3)}  ${c.id.padEnd(50)} — ${c.description.slice(0, 80)}`,
      );
    }
    console.log(`  (${dt}ms)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
