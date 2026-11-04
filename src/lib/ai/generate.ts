import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Variation } from "./intake";
import { billedUsage, type PricedModel } from "./pricing";

export const Outline = z.object({
  title: z.string(),
  modules: z.array(z.object({ title: z.string(), summary: z.string(), objectives: z.array(z.string()) })),
});
export type Outline = z.infer<typeof Outline>;

export const ModuleContent = z.object({
  sections: z.array(z.object({ heading: z.string(), markdown: z.string() })),
  diagram: z.string(), // Mermaid source, or "" when a diagram wouldn't help
  quiz: z.array(z.object({ question: z.string(), choices: z.array(z.string()), answer: z.number().int(), explanation: z.string() })),
});
export type ModuleContent = z.infer<typeof ModuleContent>;

export type CourseBrief = { intent: string; category: string; request: string; variation: Variation };
export type Usage = { inputTokens: number; outputTokens: number; costMicros: number };
export class GenerationError extends Error {}

const SYSTEM = `You write courses for KustomLearn, a hands-on, gamified learning app for CS, IT and tech.
Write for the learner's level, in plain words, with concrete examples, real commands and real code. Never pad. Accuracy matters more than length.`;

const brief = (c: CourseBrief) =>
  `Learner's words: ${c.request}
Goal: ${c.intent}
Field: ${c.category}
Path: ${c.variation.name} (${c.variation.pitch})
Level: ${c.variation.level}. Timeline: ${c.variation.weeks} weeks at ${c.variation.hoursPerWeek} hours a week.
Outcomes: ${c.variation.outcomes.join("; ")}`;

async function call<T extends z.ZodType>(schema: T, prompt: string, opts: { apiKey: string; model: PricedModel; maxTokens: number }) {
  const client = new Anthropic({ apiKey: opts.apiKey, timeout: 10 * 60_000 });
  const res = await client.beta.messages.parse({
    model: opts.model,
    max_tokens: opts.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // security courses can trip cyber classifiers; reroute instead of failing
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal") throw new GenerationError("The model declined part of this course.");
  if (res.stop_reason === "max_tokens" || !res.parsed_output) throw new GenerationError("A step came back incomplete.");
  return { data: res.parsed_output as z.infer<T>, usage: billedUsage(res.usage, opts.model) };
}

export async function generateOutline(c: CourseBrief, opts: { apiKey: string; model: PricedModel }): Promise<{ data: Outline; usage: Usage }> {
  if (process.env.KL_FAKE_AI === "1") return (await import("./fixtures")).fakeOutline(c.variation.modules);
  const { data, usage } = await call(
    Outline,
    `${brief(c)}

Write the course outline: a course title and exactly ${c.variation.modules} modules in learning order.
Each module has a short title, a one-sentence summary and 2-4 objectives starting with a verb.
${c.variation.capstone ? "The last module prepares for a final capstone project." : ""}`,
    { ...opts, maxTokens: 6000 },
  );
  if (data.modules.length !== c.variation.modules) throw new GenerationError("The outline has the wrong number of modules.");
  return { data, usage };
}

export async function generateModule(
  c: CourseBrief,
  outline: Outline,
  index: number,
  opts: { apiKey: string; model: PricedModel },
): Promise<{ data: ModuleContent; usage: Usage }> {
  if (process.env.KL_FAKE_AI === "1") return (await import("./fixtures")).fakeModule(outline.modules[index].title);
  const m = outline.modules[index];
  const { data, usage } = await call(
    ModuleContent,
    `${brief(c)}

Course outline:
${outline.modules.map((x, i) => `${i + 1}. ${x.title}`).join("\n")}

Write module ${index + 1}: "${m.title}". ${m.summary}
Objectives: ${m.objectives.join("; ")}

- sections: 3-5 lesson sections in GitHub-flavored markdown, with code blocks or commands where they help.
- diagram: one Mermaid flowchart or sequence diagram if it makes an idea clearer, otherwise "".
- quiz: 4-6 multiple-choice questions with 4 choices each; answer is the 0-based index; explanation says why.`,
    { ...opts, maxTokens: 16000 },
  );
  if (data.quiz.some((q) => q.choices.length < 2 || q.answer < 0 || q.answer >= q.choices.length)) {
    throw new GenerationError("A quiz question has an invalid answer.");
  }
  return { data, usage };
}
