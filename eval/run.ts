/**
 * Baseline runner for the agents-mode eval set.
 *
 *   pnpm tsx eval/run.ts
 *
 * Pipeline path: bypasses /api/nlp/interpret entirely (no auth, no quota).
 * Calls runAgentsPipeline directly with .env.local's GROQ_API_KEY.
 *
 * Image fixture: numeric ImageStats only — `imageUrl` is left null so A2
 * runs the cheaper stats path (no VLM tokens, faster, deterministic).
 * Adding a "with VLM" eval is a follow-up; the question we want to answer
 * here is "how good is A3 at mapping prompt+history+brief → delta", and
 * isolating the brief source (numeric vs visual) makes that signal cleaner.
 *
 * Concurrency: cases run sequentially. Per-case latency is ~2–4 s; 30
 * cases ≈ 90 s total. Sequential keeps Groq rate-limit pressure low and
 * the report deterministically ordered.
 */
// Next.js loads `.env.local` for the dev server, but dotenv/config defaults
// to `.env` only — be explicit so eval/run can run with the same secrets.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv(); // also pick up .env if present (does not override)
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { runAgentsPipeline } from "../lib/nlp/agent/graph";
import { DEFAULT_PARAMS } from "../lib/grading/params";
import { CASES, FIXTURE_STATS, type EvalCase, type GraderResult } from "./cases";
import { mergeDelta, type LLMDeltaT } from "../lib/nlp/llm-schema";

if (!process.env.GROQ_API_KEY) {
  console.error("Missing GROQ_API_KEY in .env.local");
  process.exit(1);
}

// Load LUT manifest once for LUT-aware grader bypass (see runOne below).
interface ManifestLut {
  id: string;
  tags: string[];
}
const manifest = JSON.parse(
  readFileSync("public/luts/manifest.json", "utf8"),
) as { luts: ManifestLut[] };
const lutTagsById = new Map<string, string[]>(
  manifest.luts.map((l) => [l.id, l.tags] as const),
);

type CaseRecord = {
  case: EvalCase;
  ok: boolean;
  schemaOk: boolean;
  delta: LLMDeltaT | null;
  reasoning: string | null;
  emotion: string | null;
  imageMood: string | null;
  fieldCount: number;
  callCount: number;
  latencyMs: number;
  grader: GraderResult | null;
  /** True if PASS came via LUT-aware grader credit (rather than slider grade). */
  lutCredited?: boolean;
  error?: string;
};

const countFields = (d: LLMDeltaT): number => {
  let n = 0;
  for (const k of Object.keys(d) as (keyof LLMDeltaT)[]) {
    if (k === "reasoning") continue;
    if (k === "hsl" && d.hsl) {
      for (const band of Object.values(d.hsl)) {
        if (!band) continue;
        if (band.hue !== undefined) n++;
        if (band.saturation !== undefined) n++;
        if (band.luminance !== undefined) n++;
      }
      continue;
    }
    if (k === "splitToning" && d.splitToning) {
      for (const v of Object.values(d.splitToning)) if (v !== undefined) n++;
      continue;
    }
    if (d[k] !== undefined) n++;
  }
  return n;
};

async function runOne(c: EvalCase): Promise<CaseRecord> {
  const t0 = Date.now();
  const paramsBefore = c.history?.length
    ? c.history[c.history.length - 1].paramsAfter
    : DEFAULT_PARAMS;
  try {
    const state = await runAgentsPipeline({
      userPrompt: c.prompt,
      currentParams: paramsBefore,
      imageStats: FIXTURE_STATS,
      history: c.history ?? [],
      imageUrl: null,
      userApiKey: null,
    });
    const latencyMs = Date.now() - t0;
    const delta = state.finalDelta;
    if (!delta) {
      return {
        case: c,
        ok: false,
        schemaOk: false,
        delta: null,
        reasoning: null,
        emotion: state.emotionAnalysis,
        imageMood: state.imageMood,
        fieldCount: 0,
        callCount: state.callCount,
        latencyMs,
        grader: null,
        error: state.error ?? "no delta",
      };
    }
    const paramsAfter = mergeDelta(paramsBefore, delta);

    // LUT-aware short-circuit: when A3 picked a LUT whose tags overlap
    // with the case's `acceptableLutTags`, treat the case as PASS even
    // if the original (no-LUT-assumed) grader would mark sliders missing.
    // Rationale: the LUT encodes the color identity; emitting the same
    // shift again via sliders would double the effect. See eval design
    // notes in cases.ts.
    let grader = c.grade(delta, paramsBefore);
    let lutCredited = false;
    if (delta.lutId && c.acceptableLutTags?.length) {
      const tags = lutTagsById.get(delta.lutId) ?? [];
      const overlap = c.acceptableLutTags.some((t) => tags.includes(t));
      if (overlap) {
        lutCredited = true;
        // Override grader: case is passed via the LUT path.
        grader = { passed: true, fails: [`(LUT-credited via ${delta.lutId})`] };
      }
    }
    return {
      case: c,
      ok: grader.passed,
      schemaOk: true,
      delta,
      reasoning: delta.reasoning ?? null,
      emotion: state.emotionAnalysis,
      imageMood: state.imageMood,
      fieldCount: countFields(delta),
      callCount: state.callCount,
      latencyMs,
      grader,
      lutCredited,
    };
    void paramsAfter;
  } catch (err) {
    return {
      case: c,
      ok: false,
      schemaOk: false,
      delta: null,
      reasoning: null,
      emotion: null,
      imageMood: null,
      fieldCount: 0,
      callCount: 0,
      latencyMs: Date.now() - t0,
      grader: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function fmtPct(n: number, d: number): string {
  if (d === 0) return "n/a";
  return `${n}/${d} (${Math.round((n / d) * 100)}%)`;
}

function summarise(records: CaseRecord[]): string {
  const lit = records.filter((r) => r.case.category === "literal");
  const sty = records.filter((r) => r.case.category === "stylistic");
  const chn = records.filter((r) => r.case.category === "chain");
  const passed = (rs: CaseRecord[]) => rs.filter((r) => r.ok).length;
  const schemaFail = records.filter((r) => !r.schemaOk).length;
  const compoundCases = records.filter((r) => r.case.category === "stylistic");
  const avgFieldsCompound =
    compoundCases.length === 0
      ? 0
      : compoundCases.reduce((s, r) => s + r.fieldCount, 0) /
        compoundCases.length;
  const totalCalls = records.reduce((s, r) => s + r.callCount, 0);
  const lat = records.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = lat[Math.floor(lat.length / 2)] ?? 0;
  const p95 = lat[Math.floor(lat.length * 0.95)] ?? 0;

  const lines: string[] = [];
  lines.push("# Agents-mode baseline\n");
  lines.push(`_Date: ${new Date().toISOString().slice(0, 10)}_\n`);
  lines.push(`_Model: openai/gpt-oss-20b (reasoning_effort=low)_\n`);
  lines.push(`_Image fixture: ImageStats only (no VLM); ${JSON.stringify(FIXTURE_STATS)}_\n`);
  lines.push(`\n## Headline metrics\n`);
  lines.push(`| Category | Pass rate |`);
  lines.push(`|---|---|`);
  lines.push(`| Literal (${lit.length}) | ${fmtPct(passed(lit), lit.length)} |`);
  lines.push(`| Stylistic (${sty.length}) | ${fmtPct(passed(sty), sty.length)} |`);
  lines.push(`| Chain (${chn.length}) | ${fmtPct(passed(chn), chn.length)} |`);
  lines.push(`| **Total (${records.length})** | **${fmtPct(passed(records), records.length)}** |`);
  lines.push(``);
  lines.push(`- Schema parse failures: ${schemaFail} / ${records.length}`);
  lines.push(`- Avg field count on stylistic prompts: ${avgFieldsCompound.toFixed(1)}`);
  lines.push(`- Total Groq calls: ${totalCalls}`);
  lines.push(`- Latency p50 / p95: ${p50} ms / ${p95} ms`);
  lines.push(``);
  lines.push(`## Per-case detail\n`);
  for (const r of records) {
    const status = r.ok ? "PASS" : r.schemaOk ? "FAIL" : "ERROR";
    const tag = `[${r.case.id}|${r.case.category}|${status}]`;
    lines.push(`### ${tag} "${r.case.prompt}"`);
    if (r.case.history?.length) {
      lines.push(
        `- prior turns: ${r.case.history
          .map((h) => `"${h.prompt}"`)
          .join(" → ")}`,
      );
    }
    if (r.emotion) lines.push(`- emotion: ${r.emotion.replace(/\n/g, " ").slice(0, 200)}`);
    if (r.imageMood) lines.push(`- image: ${r.imageMood.replace(/\n/g, " ").slice(0, 200)}`);
    if (r.delta) {
      lines.push(`- delta fields: ${r.fieldCount}`);
      lines.push(`- reasoning: ${r.reasoning?.slice(0, 160) ?? "(none)"}`);
      lines.push(`- delta: \`${JSON.stringify(r.delta).slice(0, 500)}\``);
    }
    if (r.error) lines.push(`- error: ${r.error}`);
    if (r.grader && r.grader.fails.length) {
      lines.push(`- fails:`);
      for (const f of r.grader.fails) lines.push(`  - ${f}`);
    }
    lines.push(`- latency: ${r.latencyMs} ms; calls: ${r.callCount}`);
    lines.push(``);
  }
  return lines.join("\n");
}

// Two rate-limit floors stack here:
//   1. Groq free-tier gpt-oss-20b: 8K TPM. Each case burns ~1.8K tokens
//      across A1+A2+A3, so 9s gap is enough on the LLM side.
//   2. Voyage AI free-without-billing: 3 RPM. Each case fires one
//      embedding call inside lutRetriever. 22s gap stays ≤ 3 RPM.
// We pick the larger of the two. With a paid Voyage tier (or Groq Dev
// tier) you can drop this back to 9000.
const PACE_MS = 22_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`Running ${CASES.length} cases sequentially (${PACE_MS}ms gap)…`);
  const records: CaseRecord[] = [];
  let i = 0;
  for (const c of CASES) {
    i++;
    if (i > 1) await sleep(PACE_MS);
    process.stdout.write(`[${i}/${CASES.length}] ${c.id} "${c.prompt.slice(0, 40)}"… `);
    const rec = await runOne(c);
    const status = rec.ok ? "PASS" : rec.schemaOk ? "FAIL" : "ERROR";
    process.stdout.write(`${status} (${rec.latencyMs}ms)\n`);
    records.push(rec);
  }

  const md = summarise(records);
  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = "eval/reports";
  mkdirSync(outDir, { recursive: true });
  const mdPath = `${outDir}/baseline-${stamp}.md`;
  const jsonPath = `${outDir}/baseline-${stamp}.json`;
  writeFileSync(mdPath, md, "utf8");
  writeFileSync(
    jsonPath,
    JSON.stringify(
      records.map((r) => ({
        id: r.case.id,
        category: r.case.category,
        prompt: r.case.prompt,
        ok: r.ok,
        schemaOk: r.schemaOk,
        delta: r.delta,
        emotion: r.emotion,
        imageMood: r.imageMood,
        fails: r.grader?.fails ?? [],
        error: r.error,
        latencyMs: r.latencyMs,
        callCount: r.callCount,
        fieldCount: r.fieldCount,
      })),
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\nWrote ${mdPath}`);
  console.log(`Wrote ${jsonPath}`);
  // Brief stdout summary
  const passed = records.filter((r) => r.ok).length;
  console.log(`Pass rate: ${passed}/${records.length}`);
  void dirname;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
