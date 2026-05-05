#!/usr/bin/env node
/**
 * Estimate input/output token cost per request for LLM-mode and the
 * redesigned Agents-mode (3 lightweight calls: A1 free-form text +
 * A2 free-form text + A3 json_object delta).
 *
 * Strategy: build the *actual* messages each path sends to Groq, then
 * approximate tokens with 4-char-per-token. Reasoning tokens taken from
 * empirical observation per reasoning_effort level for gpt-oss-20b.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const tok = (s) => Math.ceil(s.length / 4);
const read = (p) => readFileSync(resolve(root, p), "utf8");

// ── LLM mode (single-shot, json_object) ──────────────────────────────
const llmPromptSrc = read("lib/nlp/llm-prompt.ts");
const SYSTEM_PROMPT = llmPromptSrc.match(
  /export const SYSTEM_PROMPT = `([\s\S]*?)`;/,
)?.[1];

const sampleUser = [
  "Current settings: pristine.",
  "Photo: midtones, moderate-contrast, neutral.",
  "User prompt: warm cinematic golden-hour with raised shadows",
].join("\n");

const llmInput = {
  systemPrompt: tok(SYSTEM_PROMPT ?? ""),
  jsonSchema: 0, // json_object mode → no schema in input
  userMessage: tok(sampleUser),
};
const llmInputTotal =
  llmInput.systemPrompt + llmInput.jsonSchema + llmInput.userMessage;
const llmOutputVisible = 130;
const llmReasoningTokens = 150; // reasoning_effort: "low"

// ── Redesigned Agents mode (3 calls) ─────────────────────────────────
const agentPromptsSrc = read("lib/nlp/agent/prompts.ts");

const SYSTEM_PROMPT_EMOTION = agentPromptsSrc.match(
  /export const SYSTEM_PROMPT_EMOTION = `([\s\S]*?)`;/,
)?.[1];
const SYSTEM_PROMPT_IMAGE_MOOD = agentPromptsSrc.match(
  /export const SYSTEM_PROMPT_IMAGE_MOOD = `([\s\S]*?)`;/,
)?.[1];
const SYSTEM_PROMPT_ACTION = agentPromptsSrc.match(
  /export const SYSTEM_PROMPT_ACTION = `([\s\S]*?)`;/,
)?.[1];

// A1 — Emotion (plain text out, reasoning_effort low)
const emotionUser = `USER: warm cinematic golden-hour with raised shadows`;
const a1 = {
  systemPrompt: tok(SYSTEM_PROMPT_EMOTION ?? ""),
  userMessage: tok(emotionUser),
  output: 60, // ~1-2 sentences
  reasoning: 100, // reasoning_effort: "low"
};
const a1Input = a1.systemPrompt + a1.userMessage;

// A2 — Image mood (plain text out, reasoning_effort low)
const imageUser = `meanLuminance=0.450, stdLuminance=0.150, p05=0.080, p95=0.880, meanR=0.480, meanG=0.450, meanB=0.430`;
const a2 = {
  systemPrompt: tok(SYSTEM_PROMPT_IMAGE_MOOD ?? ""),
  userMessage: tok(imageUser),
  output: 35, // ~1 sentence
  reasoning: 100,
};
const a2Input = a2.systemPrompt + a2.userMessage;

// A3 — Action (json_object, reasoning_effort low)
const a3UserSample = [
  "USER: warm cinematic golden-hour with raised shadows",
  "EMOTION: Warm cinematic look with golden-hour atmosphere; lifted shadows for openness; filmic contrast.",
  "IMAGE: Balanced midtones, neutral cast; ample contrast headroom and shadow room, mild highlight ceiling.",
  "CURRENT: pristine",
].join("\n");
const a3 = {
  systemPrompt: tok(SYSTEM_PROMPT_ACTION ?? ""),
  userMessage: tok(a3UserSample),
  output: 200, // delta JSON, 10-14 fields
  reasoning: 200, // reasoning_effort: "low" — was 350 at "medium" before truncation hot-fix
};
const a3Input = a3.systemPrompt + a3.userMessage;

// ── Print ────────────────────────────────────────────────────────────
const fmt = (n) => n.toLocaleString().padStart(6);
const line = (label, val) => console.log(`  ${label.padEnd(28)} ${fmt(val)}`);

console.log("\n╔════════════════════════════════════════════════════╗");
console.log("║  TOKEN BUDGET — redesigned agents pipeline        ║");
console.log("║  estimator: 4 chars / token (±10% vs real)        ║");
console.log("╚════════════════════════════════════════════════════╝\n");

console.log("LLM mode (1 call) — json_object + reasoning_effort low:\n");
line("system prompt", llmInput.systemPrompt);
line("JSON schema", llmInput.jsonSchema);
line("user message", llmInput.userMessage);
line("─ input subtotal", llmInputTotal);
line("output (visible)", llmOutputVisible);
line("output (reasoning hidden)", llmReasoningTokens);
const llmTotal = llmInputTotal + llmOutputVisible + llmReasoningTokens;
line("══ TOTAL per request", llmTotal);
console.log();

console.log("Agents mode (3 calls):\n");
console.log("  Call 1 — Emotion (plain text, low reasoning):");
line("    system prompt", a1.systemPrompt);
line("    user message", a1.userMessage);
line("    ─ input", a1Input);
line("    output + reasoning", a1.output + a1.reasoning);
const a1Total = a1Input + a1.output + a1.reasoning;
line("    ── call 1 total", a1Total);
console.log();
console.log("  Call 2 — Image-mood (plain text, low reasoning):");
line("    system prompt", a2.systemPrompt);
line("    user message", a2.userMessage);
line("    ─ input", a2Input);
line("    output + reasoning", a2.output + a2.reasoning);
const a2Total = a2Input + a2.output + a2.reasoning;
line("    ── call 2 total", a2Total);
console.log();
console.log("  Call 3 — Action (json_object, low reasoning):");
line("    system prompt", a3.systemPrompt);
line("    user message (briefs)", a3.userMessage);
line("    ─ input", a3Input);
line("    output + reasoning", a3.output + a3.reasoning);
const a3Total = a3Input + a3.output + a3.reasoning;
line("    ── call 3 total", a3Total);
console.log();
const agentsTotal = a1Total + a2Total + a3Total;
line("══ TOTAL per request", agentsTotal);
console.log();

console.log("─────────────────────────────────────────────────────");
console.log("\nDaily budget at 200,000 tokens/day:\n");
line("LLM mode requests/day", Math.floor(200_000 / llmTotal));
line("Agents mode requests/day", Math.floor(200_000 / agentsTotal));
line("Ratio (agents/llm)", +(agentsTotal / llmTotal).toFixed(2));
console.log();

console.log("─────────────────────────────────────────────────────");
console.log("\nWhere bytes live in agents mode:\n");
const breakdown = [
  ["A3 system prompt", a3.systemPrompt],
  ["A3 reasoning (medium)", a3.reasoning],
  ["A3 output (JSON delta)", a3.output],
  ["A3 user message (briefs)", a3.userMessage],
  ["A1 system prompt", a1.systemPrompt],
  ["A2 system prompt", a2.systemPrompt],
  ["A1 + A2 reasoning (low ×2)", a1.reasoning + a2.reasoning],
  ["A1 + A2 outputs (text)", a1.output + a2.output],
  ["A2 user message (stats)", a2.userMessage],
  ["A1 user message (prompt)", a1.userMessage],
];
breakdown.sort((a, b) => b[1] - a[1]);
for (const [k, v] of breakdown) {
  const pct = ((v / agentsTotal) * 100).toFixed(1).padStart(5);
  console.log(`  ${k.padEnd(36)} ${fmt(v)}  (${pct}%)`);
}
console.log();
