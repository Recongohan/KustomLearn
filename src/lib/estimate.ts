import { costMicros, type PricedModel } from "./ai/pricing";
import type { Variation } from "./ai/intake";

// Rough per-item token budgets for generation; retune once real runs are logged.
const OUT = { outline: 3_000, lesson: 3_500, quiz: 1_200, lab: 4_500, capstone: 9_000 };
const IN_PER_CALL = 5_000; // system prompt + outline context per module call
const REPAIR_RESERVE = 0.2; // auto-repair of labs that fail validation

export type Estimate = { inputTokens: number; outputTokens: number; lowMicros: number; highMicros: number; capMicros: number };

export function estimate(v: Pick<Variation, "modules" | "labs" | "capstone">, model: PricedModel): Estimate {
  const labs = v.labs.code + v.labs.terminal + v.labs.logs;
  const calls = 1 + v.modules + (v.capstone ? 1 : 0);
  const outputTokens = Math.round(
    (OUT.outline + v.modules * (OUT.lesson + OUT.quiz) + labs * OUT.lab + (v.capstone ? OUT.capstone : 0)) * (1 + REPAIR_RESERVE),
  );
  const inputTokens = calls * IN_PER_CALL;
  const mid = costMicros(model, inputTokens, outputTokens);
  return { inputTokens, outputTokens, lowMicros: Math.round(mid * 0.8), highMicros: Math.round(mid * 1.2), capMicros: Math.round(mid * 1.3) };
}
