// USD per million tokens (input, output). Source: Anthropic pricing, checked 2026-11-04.
export const PRICES = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
} as const;

export type PricedModel = keyof typeof PRICES;

/** Cost in micro-dollars (1e-6 USD) so it fits an integer column. */
export function costMicros(model: PricedModel, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model];
  return Math.round(inputTokens * p.input + outputTokens * p.output);
}

export const formatUsd = (micros: number) => (micros > 0 && micros < 10_000 ? "<$0.01" : `$${(micros / 1e6).toFixed(2)}`);
