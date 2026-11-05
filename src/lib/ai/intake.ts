import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { billedUsage, fallbackParams, type PricedModel } from "./pricing";
import { parseOutput, STRUCTURED_BETA } from "./structured";

export const Variation = z.object({
  name: z.string(),
  pitch: z.string(),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  weeks: z.number().int(),
  hoursPerWeek: z.number().int(),
  modules: z.number().int(),
  labs: z.object({ code: z.number().int(), terminal: z.number().int(), logs: z.number().int() }),
  capstone: z.boolean(),
  outcomes: z.array(z.string()),
});
export type Variation = z.infer<typeof Variation>;

export const Intake = z.object({
  inScope: z.boolean(),
  outOfScopeReason: z.string(),
  intent: z.string(),
  category: z.string(),
  variations: z.array(Variation),
});
export type Intake = z.infer<typeof Intake>;

const SYSTEM = `You are the course designer inside KustomLearn, an app that turns what someone wants to learn into a hands-on, gamified course in CS, IT or tech.

Given the learner's description:
- inScope: false if it is not a CS, IT or tech topic (then explain kindly in outOfScopeReason and leave the rest minimal). Otherwise true and outOfScopeReason "".
- intent: their goal in one short line (max 90 characters), in second person, e.g. "Become job-ready as a SOC analyst triaging real alerts".
- category: a short "Field / Area" label, e.g. "Cybersecurity / SOC", "DevOps / Containers", "Programming / Python".
- variations: exactly 3 distinct courses they could take, e.g. a fast practical path, a deep path, and a certification or project path. Each has:
  name (2-4 words), pitch (one sentence), level, weeks (1-12), hoursPerWeek (1-20), modules (3-16),
  labs as counts per engine: code (write and test code), terminal (Linux shell tasks), logs (investigate synthetic logs with SQL); pick engines that fit the topic, 0 is fine,
  capstone (a final multi-step project), outcomes (exactly 3 short, concrete things they will be able to do).
Respect any time, level or goal the learner states. Match the learner's own words where you can.`;

export type IntakeResult = { intake: Intake; inputTokens: number; outputTokens: number; costMicros: number };

/** `usage` is what a call that ran but failed still cost, so it can be logged. */
export class IntakeError extends Error {
  constructor(message: string, readonly usage?: ReturnType<typeof billedUsage>) {
    super(message);
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/** Keeps model output inside the ranges the UI and estimator assume. */
export function normalize(intake: Intake): Intake {
  return {
    ...intake,
    intent: intake.intent.trim().slice(0, 120),
    category: intake.category.trim().slice(0, 80) || "Tech", // never empty: the create action requires it
    variations: intake.variations.slice(0, 3).map((v, i) => ({
      ...v,
      name: v.name.trim().slice(0, 60) || `Option ${i + 1}`,
      pitch: v.pitch.trim().slice(0, 300),
      weeks: clamp(v.weeks, 1, 12),
      hoursPerWeek: clamp(v.hoursPerWeek, 1, 20),
      modules: clamp(v.modules, 3, 16),
      labs: { code: clamp(v.labs.code, 0, 30), terminal: clamp(v.labs.terminal, 0, 30), logs: clamp(v.labs.logs, 0, 30) },
      outcomes: v.outcomes.map((o) => o.trim().slice(0, 200)).filter(Boolean).slice(0, 3),
    })),
  };
}

export async function understand(request: string, opts: { apiKey: string; model: PricedModel }): Promise<IntakeResult> {
  if (process.env.KL_FAKE_AI === "1") {
    const { fakeIntake } = await import("./fixtures");
    return { intake: fakeIntake(request), inputTokens: 0, outputTokens: 0, costMicros: 0 };
  }

  const client = new Anthropic({ apiKey: opts.apiKey, timeout: 90_000 });
  const format = betaZodOutputFormat(Intake);
  const fallback = fallbackParams(opts.model); // security topics can trip cyber classifiers; reroute instead of failing
  const res = await client.beta.messages.create({
    model: opts.model,
    max_tokens: 4000,
    ...fallback,
    betas: [...(fallback.betas ?? []), STRUCTURED_BETA],
    output_config: { effort: "low", format },
    system: SYSTEM,
    messages: [{ role: "user", content: request }],
  });
  const usage = billedUsage(res.usage, opts.model); // charged even when the answer can't be used
  if (res.stop_reason === "refusal") throw new IntakeError("The model declined this request. Try describing it differently.", usage);
  const parsed = parseOutput(res, format);
  if (!parsed) throw new IntakeError("Couldn't understand that. Try again in a moment.", usage);
  const intake = normalize(parsed);
  if (intake.inScope && (!intake.intent || intake.variations.length !== 3 || intake.variations.some((v) => !v.outcomes.length))) throw new IntakeError("Couldn't build three options. Try again.", usage);
  return { intake, ...usage };
}
