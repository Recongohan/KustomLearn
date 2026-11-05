import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Variation } from "./intake";
import { billedUsage, fallbackParams, type PricedModel } from "./pricing";
import { parseOutput, STRUCTURED_BETA } from "./structured";

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
/** `usage` is what a failed call still cost; `truncated` means it hit its max_tokens. */
export class GenerationError extends Error {
  constructor(message: string, readonly usage?: Usage, readonly truncated = false) {
    super(message);
  }
}

export const STEP_MAX_OUTPUT = { outline: 6000, module: 16000 };
type Opts = { apiKey: string; model: PricedModel; maxTokens?: number };

const SYSTEM = `You write courses for KustomLearn, a hands-on, gamified learning app for CS, IT and tech.
Write for the learner's level, in plain words, with concrete examples, real commands and real code. Never pad. Accuracy matters more than length.`;

const brief = (c: CourseBrief) =>
  `Learner's words: ${c.request}
Goal: ${c.intent}
Field: ${c.category}
Path: ${c.variation.name} (${c.variation.pitch})
Level: ${c.variation.level}. Timeline: ${c.variation.weeks} weeks at ${c.variation.hoursPerWeek} hours a week.
Outcomes: ${c.variation.outcomes.join("; ")}`;

// `shared` is the same for every module of a course, so it is cached and later module calls read it cheaply.
async function call<T extends z.ZodType>(schema: T, prompt: string | { shared: string; task: string }, opts: { apiKey: string; model: PricedModel; maxTokens: number }) {
  const client = new Anthropic({ apiKey: opts.apiKey, timeout: 10 * 60_000 });
  const format = betaZodOutputFormat(schema);
  const fallback = fallbackParams(opts.model); // security courses can trip cyber classifiers; reroute instead of failing
  const res = await client.beta.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    ...fallback,
    betas: [...(fallback.betas ?? []), STRUCTURED_BETA],
    output_config: { effort: "medium", format },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content:
          typeof prompt === "string"
            ? prompt
            : [
                { type: "text", text: prompt.shared, cache_control: { type: "ephemeral" } },
                { type: "text", text: prompt.task },
              ],
      },
    ],
  });
  const usage = billedUsage(res.usage, opts.model);
  if (res.stop_reason === "refusal") throw new GenerationError("The model declined part of this course.", usage);
  if (res.stop_reason === "max_tokens") throw new GenerationError("A step came back incomplete.", usage, true);
  const data = parseOutput(res, format);
  if (!data) throw new GenerationError("A step came back incomplete.", usage);
  return { data: data as z.infer<T>, usage };
}

export async function generateOutline(c: CourseBrief, opts: Opts): Promise<{ data: Outline; usage: Usage }> {
  const maxTokens = Math.min(STEP_MAX_OUTPUT.outline, opts.maxTokens ?? Infinity);
  if (process.env.KL_FAKE_AI === "1") return (await import("./fixtures")).fakeOutline(c.variation.modules, maxTokens);
  const { data, usage } = await call(
    Outline,
    `${brief(c)}

Write the course outline: a course title and exactly ${c.variation.modules} modules in learning order.
Each module has a short title, a one-sentence summary and 2-4 objectives starting with a verb.
${c.variation.capstone ? "The last module prepares for a final capstone project." : ""}`,
    { ...opts, maxTokens },
  );
  if (data.modules.length !== c.variation.modules) throw new GenerationError("The outline has the wrong number of modules.", usage);
  return { data, usage };
}

export async function generateModule(
  c: CourseBrief,
  outline: Outline,
  index: number,
  opts: Opts,
): Promise<{ data: ModuleContent; usage: Usage }> {
  const maxTokens = Math.min(STEP_MAX_OUTPUT.module, opts.maxTokens ?? Infinity);
  if (process.env.KL_FAKE_AI === "1") return (await import("./fixtures")).fakeModule(outline.modules[index].title, maxTokens);
  const m = outline.modules[index];
  const { data, usage } = await call(
    ModuleContent,
    {
      shared: `${brief(c)}

Course outline:
${outline.modules.map((x, i) => `${i + 1}. ${x.title}: ${x.summary}`).join("\n")}

Module format:
- sections: 3-5 lesson sections in GitHub-flavored markdown, with code blocks or commands where they help.
- diagram: one Mermaid flowchart or sequence diagram if it makes an idea clearer, otherwise "".
- quiz: 4-6 multiple-choice questions with 4 choices each; answer is the 0-based index; explanation says why.`,
      task: `Write module ${index + 1}: "${m.title}". ${m.summary}
Objectives: ${m.objectives.join("; ")}`,
    },
    { ...opts, maxTokens },
  );
  if (!data.quiz.length || data.quiz.some((q) => q.choices.length < 2 || q.answer < 0 || q.answer >= q.choices.length)) {
    throw new GenerationError("The quiz is empty or has an invalid answer.", usage);
  }
  return { data, usage };
}
