"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Loader2, Wand2, Bot } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { parsePrompt } from "@/lib/nlp/parser";
import { suggestForUnmatched } from "@/lib/nlp/fallback";
import { suggestionFor, summarizeApplied } from "@/lib/nlp/summary";
import { hasDelta, mergeDelta, type LLMDeltaT } from "@/lib/nlp/llm-schema";
import {
  type Mode,
  type ServerMode,
  MODE_COST,
  DAILY_LLM_LIMIT,
  normalizeStoredMode,
} from "@/lib/nlp/modes";
import type { TraceEntry } from "@/lib/nlp/agent/state";
import type { ParseResult } from "@/lib/nlp/types";
import type { GradingParams } from "@/lib/grading/params";
import type { ImageStats } from "@/lib/grading/imageStats";
import { cn } from "@/lib/utils";

type ExampleChip = { phrase: string; description: string };

type Message =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      thinking?: boolean;
      thinkingLabel?: string;
      ai?: boolean;
      agents?: boolean;
      text?: string;
      applied?: string[];
      reasoning?: string;
      quota?: { used: number; limit: number };
      hint?: string;
      tryChips?: ExampleChip[];
      trace?: TraceEntry[];
      downgraded?: boolean;
    };

const STARTER_EXAMPLES: ExampleChip[] = [
  { phrase: "cinematic", description: "cinematic teal-orange" },
  { phrase: "moody, blue shadows", description: "moody + blue shadows" },
  { phrase: "warmer", description: "warmer" },
  { phrase: "bluer sky", description: "deepen sky" },
  { phrase: "bright and airy", description: "bright & airy" },
];

const ALL_EXAMPLES: ExampleChip[] = [
  { phrase: "cinematic", description: "cinematic teal-orange" },
  { phrase: "filmic", description: "film emulation" },
  { phrase: "vintage", description: "vintage fade" },
  { phrase: "moody, blue shadows", description: "moody + blue shadows" },
  { phrase: "golden hour, warmer", description: "golden hour" },
  { phrase: "cyberpunk", description: "cyberpunk" },
  { phrase: "warmer", description: "warmer" },
  { phrase: "cooler", description: "cooler" },
  { phrase: "bluer sky", description: "deepen sky" },
  { phrase: "greener foliage", description: "deepen greens" },
  { phrase: "more contrast, punchier", description: "punchier" },
  { phrase: "less contrast, softer", description: "soft mood" },
  { phrase: "subtly warmer and a bit moody", description: "compound prompt" },
  { phrase: "protect highlights, lift shadows", description: "tame the dynamic range" },
];

const EXAMPLES_QUERY_RE =
  /^\s*(examples?|more|more examples?|show examples?|help|ideas?|inspire me)\s*$/i;
const MODE_KEY = "nlumination.aiMode";

function shuffledExamples(n = 6): ExampleChip[] {
  const arr = ALL_EXAMPLES.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length));
}

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  text: 'Try one of these — or type your own. (Type "examples" any time for more ideas.)',
  tryChips: STARTER_EXAMPLES,
};

type Props = {
  params: GradingParams;
  onParams: (next: GradingParams) => void;
  stats?: ImageStats | null;
  layoutNonce?: number;
  className?: string;
};

type LLMResponse =
  | {
      ok: true;
      delta: LLMDeltaT;
      quota: { used: number; limit: number };
      trace?: TraceEntry[];
      downgraded?: boolean;
    }
  | {
      ok: false;
      reason: "quota" | "auth" | "unavailable";
      quotaLimit?: number;
      trace?: TraceEntry[];
    };

async function callLLM(
  prompt: string,
  current: GradingParams,
  stats: ImageStats | null | undefined,
  mode: ServerMode,
): Promise<LLMResponse> {
  try {
    const res = await fetch("/api/nlp/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, current, stats: stats ?? null, mode }),
    });
    if (res.status === 401) return { ok: false, reason: "auth" };
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, reason: "quota", quotaLimit: body?.quota?.limit };
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, reason: "unavailable", trace: body?.trace };
    }
    const body = (await res.json()) as {
      delta: LLMDeltaT;
      quota: { used: number; limit: number };
      trace?: TraceEntry[];
      downgraded?: boolean;
    };
    return {
      ok: true,
      delta: body.delta,
      quota: body.quota,
      trace: body.trace,
      downgraded: body.downgraded,
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export function ChatPanel({ params, onParams, stats, layoutNonce, className }: Props) {
  const { isSignedIn } = useAuth();
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [mode, setMode] = useState<Mode>("auto");
  const [quotaState, setQuotaState] = useState<{ used: number; limit: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const statsRef = useRef(stats);
  statsRef.current = stats;

  // Hydrate persisted mode after mount; "ai" → "llm" backward compat.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MODE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode(normalizeStoredMode(saved));
    } catch {
      /* ignore */
    }
  }, []);

  const setModeAndPersist = (m: Mode) => {
    setMode(m);
    try {
      window.localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, messages]);

  useEffect(() => {
    if (layoutNonce === undefined) return;
    const t = setTimeout(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 520);
    return () => clearTimeout(t);
  }, [layoutNonce]);

  const remaining = quotaState
    ? Math.max(0, quotaState.limit - quotaState.used)
    : DAILY_LLM_LIMIT;
  const agentsAffordable = remaining >= MODE_COST.agents.estimated;
  const llmAffordable = remaining >= MODE_COST.llm.estimated;

  // ── Message factories ─────────────────────────────────────────────
  const userMsg = (ts: number, text: string): Message => ({
    id: `u-${ts}`,
    role: "user",
    text,
  });

  const thinkingMsg = (ts: number, label: string): Message => ({
    id: `a-${ts}`,
    role: "assistant",
    thinking: true,
    thinkingLabel: label,
  });

  const parserAppliedMsg = (
    ts: number,
    before: GradingParams,
    result: ParseResult,
  ): Message => {
    const applied = summarizeApplied(before, result.params, result.understood);
    const hint = suggestionFor(result.understood);
    const tryChips =
      result.unmatched.length > 0
        ? suggestForUnmatched(result.unmatched).slice(0, 4)
        : undefined;
    return { id: `a-${ts}`, role: "assistant", applied, hint, tryChips };
  };

  const chipsMsg = (
    ts: number,
    result: ParseResult,
    raw: string,
    prefix?: string,
    trace?: TraceEntry[],
  ): Message => {
    const tryChips = suggestForUnmatched(
      result.unmatched.length ? result.unmatched : [raw],
    ).slice(0, 4);
    return {
      id: `a-${ts}`,
      role: "assistant",
      text: prefix,
      tryChips: tryChips.length ? tryChips : undefined,
      trace,
    };
  };

  const aiAppliedMsg = (
    ts: number,
    before: GradingParams,
    next: GradingParams,
    delta: LLMDeltaT,
    quota: { used: number; limit: number },
    opts: { agents?: boolean; trace?: TraceEntry[]; downgraded?: boolean } = {},
  ): Message => {
    const applied = summarizeApplied(before, next, []);
    return {
      id: `a-${ts}`,
      role: "assistant",
      ai: !opts.agents,
      agents: opts.agents,
      applied: applied.length ? applied : ["adjustments"],
      reasoning: delta.reasoning,
      quota,
      trace: opts.trace,
      downgraded: opts.downgraded,
    };
  };

  // ── Submit ─────────────────────────────────────────────────────────
  const submit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (EXAMPLES_QUERY_RE.test(trimmed)) {
      const ts = Date.now();
      setMessages((m) => [
        ...m,
        userMsg(ts, trimmed),
        {
          id: `a-${ts}`,
          role: "assistant",
          text: "Here are more ideas — click any to try, or remix them with your own words:",
          tryChips: shuffledExamples(),
        },
      ]);
      setValue("");
      return;
    }

    setValue("");
    const ts = Date.now();
    const before = paramsRef.current;
    const parserResult = parsePrompt(trimmed, before, statsRef.current);

    const handleAfterAICall = (
      ai: LLMResponse,
      ranAgents: boolean,
      thinkingId: string,
    ) => {
      if (ai.ok && hasDelta(ai.delta)) {
        // The server may have downgraded an agents request to llm — when
        // it does, this reply was actually an llm result, not agents.
        const wasAgents = ranAgents && !ai.downgraded;
        const next = mergeDelta(before, ai.delta);
        onParams(next);
        setQuotaState(ai.quota);
        setMessages((m) =>
          replaceById(
            m,
            thinkingId,
            aiAppliedMsg(ts, before, next, ai.delta, ai.quota, {
              agents: wasAgents,
              trace: ai.trace,
              downgraded: ai.downgraded,
            }),
          ),
        );
        return true;
      }
      return false;
    };

    // ── Agents mode (signed-in only) ──
    if (mode === "agents" && isSignedIn) {
      setMessages((m) => [
        ...m,
        userMsg(ts, trimmed),
        thinkingMsg(ts, "Agents thinking…"),
      ]);
      const ai = await callLLM(trimmed, before, statsRef.current, "agents");
      if (handleAfterAICall(ai, true, `a-${ts}`)) return;

      const failPrefix =
        !ai.ok && ai.reason === "quota"
          ? `Daily limit reached (${ai.quotaLimit ?? DAILY_LLM_LIMIT}/day). Falling back to keywords.`
          : !ai.ok && ai.reason === "unavailable"
            ? "Agents unavailable — falling back to keywords."
            : "Agents returned no usable delta — falling back to keywords.";

      // Surface partial trace (analyst breadcrumbs) even when the
      // pipeline fell over — gives the user some idea of what was
      // attempted instead of a bare "unavailable".
      const failTrace = !ai.ok ? ai.trace : undefined;

      if (parserResult.understood.length > 0) {
        onParams(parserResult.params);
        const base = parserAppliedMsg(ts, before, parserResult) as Extract<
          Message,
          { role: "assistant" }
        >;
        setMessages((m) =>
          replaceById(m, `a-${ts}`, { ...base, text: failPrefix, trace: failTrace }),
        );
      } else {
        setMessages((m) =>
          replaceById(
            m,
            `a-${ts}`,
            chipsMsg(ts, parserResult, trimmed, failPrefix, failTrace),
          ),
        );
      }
      return;
    }

    // ── LLM mode (single-shot, signed-in only) ──
    if (mode === "llm" && isSignedIn) {
      setMessages((m) => [
        ...m,
        userMsg(ts, trimmed),
        thinkingMsg(ts, "AI thinking…"),
      ]);
      const ai = await callLLM(trimmed, before, statsRef.current, "llm");
      if (handleAfterAICall(ai, false, `a-${ts}`)) return;

      const failPrefix =
        !ai.ok && ai.reason === "quota"
          ? `Daily limit reached (${ai.quotaLimit ?? DAILY_LLM_LIMIT}/day). Falling back to keywords.`
          : !ai.ok && ai.reason === "unavailable"
            ? "AI unavailable — falling back to keywords."
            : undefined;

      if (parserResult.understood.length > 0) {
        onParams(parserResult.params);
        const base = parserAppliedMsg(ts, before, parserResult);
        setMessages((m) =>
          replaceById(m, `a-${ts}`, failPrefix ? { ...base, text: failPrefix } : base),
        );
      } else {
        setMessages((m) =>
          replaceById(m, `a-${ts}`, chipsMsg(ts, parserResult, trimmed, failPrefix)),
        );
      }
      return;
    }

    // ── Auto mode (default) — parser-first; LLM single-shot fallback ──
    if (parserResult.understood.length > 0) {
      onParams(parserResult.params);
      setMessages((m) => [
        ...m,
        userMsg(ts, trimmed),
        parserAppliedMsg(ts, before, parserResult),
      ]);
      return;
    }

    if (!isSignedIn) {
      setMessages((m) => [...m, userMsg(ts, trimmed), chipsMsg(ts, parserResult, trimmed)]);
      return;
    }

    setMessages((m) => [
      ...m,
      userMsg(ts, trimmed),
      thinkingMsg(ts, "AI thinking…"),
    ]);
    const ai = await callLLM(trimmed, before, statsRef.current, "llm");
    if (handleAfterAICall(ai, false, `a-${ts}`)) return;

    const prefix =
      !ai.ok && ai.reason === "quota"
        ? `Daily limit reached (${ai.quotaLimit ?? DAILY_LLM_LIMIT}/day).`
        : undefined;
    setMessages((m) => replaceById(m, `a-${ts}`, chipsMsg(ts, parserResult, trimmed, prefix)));
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev-1)]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)]/60 px-4 py-3 text-sm font-medium text-[var(--color-fg)]">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--color-accent)]" />
          Prompt
        </div>
        {isSignedIn && (
          <ModeToggle
            mode={mode}
            onChange={setModeAndPersist}
            agentsAffordable={agentsAffordable}
            llmAffordable={llmAffordable}
          />
        )}
      </header>

      {isSignedIn && (
        <div className="flex items-center justify-between border-b border-[var(--color-border)]/40 px-4 py-1.5 text-[10px] text-[var(--color-fg-dim)]">
          <span>{MODE_COST[mode].hint}</span>
          {quotaState && (
            <span>
              Calls used today: {quotaState.used}/{quotaState.limit}
            </span>
          )}
        </div>
      )}

      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm scrollbar-thin"
        style={{ overflowAnchor: "auto" }}
      >
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-[var(--color-bg-elev-3)] px-3 py-2 text-[var(--color-fg)]">
                {m.text}
              </div>
            </div>
          ) : (
            <AssistantMessage key={m.id} m={m} onChip={submit} />
          ),
        )}
      </div>

      <div className="border-t border-[var(--color-border)]/60 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(value);
          }}
          className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev-2)]/60 px-3 py-2 transition focus-within:border-[var(--color-border-strong)]"
        >
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              mode === "agents"
                ? 'e.g. "moody and contemplative, golden hour feel"'
                : mode === "llm"
                  ? 'e.g. "give it a chilly nordic feeling"'
                  : 'e.g. "moody, blue shadows" — or type "examples"'
            }
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-dim)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className="rounded-full bg-[var(--color-fg)] p-1.5 text-[var(--color-bg)] transition disabled:pointer-events-none disabled:opacity-30 hover:opacity-90"
            aria-label="Apply prompt"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}

function replaceById(messages: Message[], id: string, next: Message): Message[] {
  return messages.map((m) => (m.id === id ? next : m));
}

function ModeToggle({
  mode,
  onChange,
  agentsAffordable,
  llmAffordable,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  agentsAffordable: boolean;
  llmAffordable: boolean;
}) {
  const pillBase =
    "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition disabled:opacity-40 disabled:cursor-not-allowed";
  const activeCls = "bg-[var(--color-bg-elev-3)] text-[var(--color-fg)]";
  const idleCls =
    "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]";

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev-2)]/60 p-0.5"
      role="group"
      aria-label="Prompt interpretation mode"
    >
      <button
        type="button"
        onClick={() => onChange("auto")}
        className={cn(pillBase, mode === "auto" ? activeCls : idleCls)}
        title={MODE_COST.auto.hint}
      >
        Auto
      </button>
      <button
        type="button"
        onClick={() => onChange("llm")}
        disabled={!llmAffordable}
        className={cn(
          pillBase,
          "flex items-center gap-1",
          mode === "llm" ? activeCls : idleCls,
        )}
        title={
          llmAffordable
            ? MODE_COST.llm.hint
            : "Out of budget — try Auto (uses parser when possible)"
        }
      >
        <Wand2 className="h-3 w-3" />
        LLM
      </button>
      <button
        type="button"
        onClick={() => onChange("agents")}
        disabled={!agentsAffordable}
        className={cn(
          pillBase,
          "flex items-center gap-1",
          mode === "agents" ? activeCls : idleCls,
        )}
        title={
          agentsAffordable
            ? MODE_COST.agents.hint
            : "Not enough budget for Agents — try LLM (1 call) or Auto"
        }
      >
        <Bot className="h-3 w-3" />
        Agents
      </button>
    </div>
  );
}

function traceToLines(trace: TraceEntry[]): string[] {
  const out: string[] = [];
  for (const t of trace) {
    switch (t.node) {
      case "emotionAnalyst":
        out.push(t.ok ? "🧠 Analyzed emotion" : `🧠 Emotion analyst failed (${t.error ?? "unknown"})`);
        break;
      case "imageMoodAnalyst":
        out.push(t.ok ? "🖼️ Read image" : `🖼️ Image analyst failed (${t.error ?? "unknown"})`);
        break;
      case "actionAgent":
        if (t.ok) out.push("✨ Composed delta");
        else out.push(`✨ Action agent failed (${t.error ?? "unknown"})`);
        break;
      case "fallback":
        out.push(`↩ Fell back to single-shot (${t.reason})`);
        break;
      default:
        break;
    }
  }
  return out;
}

function AssistantMessage({
  m,
  onChip,
}: {
  m: Extract<Message, { role: "assistant" }>;
  onChip: (s: string) => void;
}) {
  if (m.thinking) {
    return (
      <div className="flex items-center gap-2 text-[var(--color-fg-muted)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-accent)]" />
        <span className="text-xs">{m.thinkingLabel ?? "Thinking…"}</span>
      </div>
    );
  }

  const showApplied = m.applied && m.applied.length > 0;
  const showText = !!m.text;
  const showChipsHeader = !showApplied && !showText && m.tryChips && m.tryChips.length > 0;
  const showSilentFallback =
    !showApplied && !showText && (!m.tryChips || m.tryChips.length === 0);
  const traceLines = m.trace ? traceToLines(m.trace) : [];

  return (
    <div className="max-w-[95%] space-y-1.5">
      {showText && <div className="text-[var(--color-fg-muted)]">{m.text}</div>}
      {traceLines.length > 0 && (
        <div className="space-y-0.5 text-[10px] text-[var(--color-fg-dim)]">
          {traceLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
      {m.downgraded && (
        <div className="text-[10px] italic text-[var(--color-fg-dim)]">
          Budget low — used LLM mode instead of Agents.
        </div>
      )}
      {showApplied && (
        <div className="text-[var(--color-fg-muted)]">
          {m.agents && (
            <span className="mr-1.5 inline-flex items-center gap-1 rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-[var(--color-accent)]">
              <Bot className="h-2.5 w-2.5" />
              Agents
            </span>
          )}
          {m.ai && (
            <span className="mr-1.5 inline-flex items-center gap-1 rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-[var(--color-accent)]">
              <Wand2 className="h-2.5 w-2.5" />
              LLM
            </span>
          )}
          <span className="text-[var(--color-fg-dim)]">applied:</span>{" "}
          <span className="text-[var(--color-fg)]">{m.applied!.join(", ")}</span>
        </div>
      )}
      {showChipsHeader && (
        <div className="text-[var(--color-fg-muted)]">
          Hmm, I didn&apos;t catch that. Did you mean:
        </div>
      )}
      {showSilentFallback && (
        <div className="text-[var(--color-fg-muted)]">
          I didn&apos;t catch that one — rephrase, or type{" "}
          <span className="text-[var(--color-fg)]">examples</span> for ideas.
        </div>
      )}
      {m.reasoning && (
        <div className="text-xs italic text-[var(--color-fg-dim)]">{m.reasoning}</div>
      )}
      {m.hint && (
        <div className="text-xs italic text-[var(--color-fg-dim)]">→ {m.hint}</div>
      )}
      {m.quota && (
        <div className="text-[10px] text-[var(--color-fg-dim)]">
          Calls used today: {m.quota.used}/{m.quota.limit}
        </div>
      )}
      {m.tryChips && m.tryChips.length > 0 && (
        <>
          {showApplied && (
            <div className="text-xs text-[var(--color-fg-dim)]">did you also mean:</div>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {m.tryChips.map((s, i) => (
              <button
                key={i}
                onClick={() => onChip(s.phrase)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] px-2 py-0.5 text-[11px] text-[var(--color-fg)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-elev-3)]"
              >
                {s.phrase}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
