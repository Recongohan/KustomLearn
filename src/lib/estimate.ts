import { costMicros, writerFor, type PricedModel } from "./ai/pricing";
import type { Variation } from "./ai/intake";

// Rough per-item token budgets for generation; retune once real runs are logged.
const OUT = { outline: 3_000, lesson: 3_500, quiz: 1_200, lab: 4_500, capstone: 9_000 };
export const IN_PER_CALL = 5_000; // system prompt + outline context per module call
const REPAIR_RESERVE = 0.2; // auto-repair of labs that fail validation

export type Estimate = {
  inputTokens: number;
  outputTokens: number;
  /** Total tokens: what the learner sees. Model-independent. */
  lowTokens: number;
  highTokens: number;
  capTokens: number;
  lowMicros: number;
  highMicros: number;
  capMicros: number;
};

/** "212K tokens" style: what the UI shows instead of dollars. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function estimate(v: Pick<Variation, "modules" | "labs" | "capstone">, model: PricedModel): Estimate {
  const labs = v.labs.code + v.labs.terminal + v.labs.logs;
  const calls = 1 + v.modules + (v.capstone ? 1 : 0);
  const writing = Math.round((v.modules * (OUT.lesson + OUT.quiz) + labs * OUT.lab + (v.capstone ? OUT.capstone : 0)) * (1 + REPAIR_RESERVE));
  const outputTokens = OUT.outline + writing;
  const inputTokens = calls * IN_PER_CALL;
  // The outline is planned on the chosen model, everything after it is written by writerFor(model).
  // shortcut: prices all input at the full rate, ignoring cache reads; retune from logged runs.
  const mid = costMicros(model, IN_PER_CALL, OUT.outline) + costMicros(writerFor(model), inputTokens - IN_PER_CALL, writing);
  const total = inputTokens + outputTokens;
  const range = (x: number, f: number) => Math.round(x * f);
  return {
    inputTokens,
    outputTokens,
    lowTokens: range(total, 0.8),
    highTokens: range(total, 1.2),
    capTokens: range(total, 1.3),
    lowMicros: range(mid, 0.8),
    highMicros: range(mid, 1.2),
    capMicros: range(mid, 1.3),
  };
}
