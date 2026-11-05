// USD per million tokens (input, output, cache read). Cache writes cost 1.25x input. Source: Anthropic pricing, checked 2026-11-04.
export const PRICES = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  // Not selectable: server-side fallbacks can hand a declined request to these, billed at their own rates.
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
} as const;
const CACHE_WRITE = 1.25;

export type PricedModel = keyof typeof PRICES;

/** Cost in micro-dollars (1e-6 USD) so it fits an integer column. */
export function costMicros(model: PricedModel, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model];
  return Math.round(inputTokens * p.input + outputTokens * p.output);
}

type Attempt = { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; model?: string | null };

/**
 * Tokens and cost across every attempt of one call. With fallbacks, top-level usage covers only the
 * attempt that answered; `iterations` lists each attempt (a declined one included) with its own model.
 * Input tokens include cache writes and reads: they count toward the cap, but reads cost a fraction.
 */
export function billedUsage(usage: Attempt & { iterations?: Attempt[] | null }, model: PricedModel) {
  const attempts = usage.iterations?.length ? usage.iterations : [usage];
  let inputTokens = 0, outputTokens = 0, cost = 0;
  for (const a of attempts) {
    // An unknown model is priced at the highest known rate, so the spend meter errs toward stopping early.
    const m = (a.model && a.model in PRICES ? a.model : a.model ? "claude-opus-5" : model) as PricedModel;
    const written = a.cache_creation_input_tokens ?? 0, read = a.cache_read_input_tokens ?? 0;
    inputTokens += a.input_tokens + written + read;
    outputTokens += a.output_tokens;
    cost += costMicros(m, a.input_tokens, a.output_tokens) + Math.round(written * PRICES[m].input * CACHE_WRITE + read * PRICES[m].cacheRead);
  }
  return { inputTokens, outputTokens, costMicros: cost };
}

/** No server-side fallback exists for Haiku 5.5; the docs say not to send the parameter. */
export const fallbackParams = (model: PricedModel) =>
  model === "claude-haiku-5-5" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

/** Planning (intake, outline) uses the chosen model; lessons are written by a cheaper one where it holds quality. */
export const writerFor = (model: PricedModel): PricedModel => (model === "claude-opus-5-5" ? "claude-sonnet-5-5" : model);

export const formatUsd = (micros: number) => (micros > 0 && micros < 10_000 ? "<$0.01" : `$${(micros / 1e6).toFixed(2)}`);
