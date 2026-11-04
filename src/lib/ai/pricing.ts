// USD per million tokens (input, output). Source: Anthropic pricing, checked 2026-11-04.
export const PRICES = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  // Not selectable: server-side fallbacks can hand a declined request to these, billed at their own rates.
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
} as const;

export type PricedModel = keyof typeof PRICES;

/** Cost in micro-dollars (1e-6 USD) so it fits an integer column. */
export function costMicros(model: PricedModel, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model];
  return Math.round(inputTokens * p.input + outputTokens * p.output);
}

type Attempt = { input_tokens: number; output_tokens: number; model?: string | null };

/**
 * Tokens and cost across every attempt of one call. With fallbacks, top-level usage covers only the
 * attempt that answered; `iterations` lists each attempt (a declined one included) with its own model.
 */
export function billedUsage(usage: Attempt & { iterations?: Attempt[] | null }, model: PricedModel) {
  const attempts = usage.iterations?.length ? usage.iterations : [usage];
  let inputTokens = 0, outputTokens = 0, cost = 0;
  for (const a of attempts) {
    // An unknown model is priced at the highest known rate, so the spend meter errs toward stopping early.
    const m = (a.model && a.model in PRICES ? a.model : a.model ? "claude-opus-5" : model) as PricedModel;
    inputTokens += a.input_tokens;
    outputTokens += a.output_tokens;
    cost += costMicros(m, a.input_tokens, a.output_tokens);
  }
  return { inputTokens, outputTokens, costMicros: cost };
}

export const formatUsd = (micros: number) => (micros > 0 && micros < 10_000 ? "<$0.01" : `$${(micros / 1e6).toFixed(2)}`);
