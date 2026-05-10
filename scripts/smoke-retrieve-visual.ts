/**
 * Smoke-retrieve targeting visual-character prompts. Tests whether the
 * LUT tool-retriever can distinguish numbered variants (1/2/3/4) and
 * direction variants (cold/warm/cross-process) now that descriptions
 * are grounded in actual visual observation.
 *
 * Paced 22s/query for Voyage's 3 RPM free-tier limit.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { retrieveLuts } from "../lib/nlp/lut-retrieve";

const QUERIES = [
  "extreme bleach bypass blown out highlights",
  "subtle bleach with warm sky preserved",
  "near-monochrome cool grey-blue dystopian sci-fi",
  "heavy orange amber wash like fire",
  "pastel pink purple dreamy sunset romance",
  "olive green thriller suspense",
  "vintage expired faded polaroid all amber",
  "cold cyan polaroid cinematic instant",
  "warm cream amber faded polaroid",
  "cross processed surreal lo-fi blue magenta",
  "moonlight day-for-night dark navy",
  "anime vivid clean saturated cartoon",
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
    try {
      const top = await retrieveLuts(q, 3);
      if (top.length === 0) {
        console.log(`  (no candidates)`);
        continue;
      }
      for (const c of top) {
        console.log(
          `  ${c.score.toFixed(3)}  ${c.id.padEnd(56)} — ${c.description.slice(0, 80)}`,
        );
      }
    } catch (e) {
      console.log(`  ERROR: ${e}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
