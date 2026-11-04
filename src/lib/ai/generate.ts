import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Variation } from "./intake";
import { COMMANDS } from "../labs/shell";
import { CodeLab, LogsLab, TerminalLab, type StoredLab } from "../labs/types";
import { billedUsage, fallbackParams, type PricedModel } from "./pricing";

export const Outline = z.object({
  title: z.string(),
  modules: z.array(z.object({ title: z.string(), summary: z.string(), objectives: z.array(z.string()) })),
});
export type Outline = z.infer<typeof Outline>;

export const ModuleContent = z.object({
  sections: z.array(z.object({ heading: z.string(), markdown: z.string() })),
  diagram: z.string(), // Mermaid source, or "" when a diagram wouldn't help
  quiz: z.array(z.object({ question: z.string(), choices: z.array(z.string()), answer: z.number().int(), explanation: z.string() })),
  labs: z.array(LogsLab),
  codeLabs: z.array(CodeLab),
  terminalLabs: z.array(TerminalLab),
});
type GeneratedModule = z.infer<typeof ModuleContent>;
/** A module as stored: its labs validated and carrying their reference result. Courses from before labs have none. */
export type ModuleContent = Omit<GeneratedModule, "labs" | "codeLabs" | "terminalLabs"> & { labs?: StoredLab[] };
export type LabCounts = { logs: number; code: number; terminal: number };

export type CourseBrief = { intent: string; category: string; request: string; variation: Variation };
export type Usage = { inputTokens: number; outputTokens: number; costMicros: number };
/** `usage` is what a failed call still cost; `truncated` means it hit its max_tokens. */
export class GenerationError extends Error {
  constructor(message: string, readonly usage?: Usage, readonly truncated = false) {
    super(message);
  }
}

export const STEP_MAX_OUTPUT = { outline: 6000, module: 16000, repair: 8000 };

const CODE_RULES = `Each code lab is graded by calling the learner's function with each test's arguments and comparing the return value with your solution's, so:
  language: "python" or "javascript", whichever fits the course (Python unless the course is about JavaScript or the web).
  entry: the function's name. starter: the signature with a stub body that does not solve it. solution: a complete reference implementation, standard library only, no input(), files or network.
  task: markdown that says what the function takes and returns, with one worked example.
  tests: 4-8, each with a short name and args, a JSON array of the call's arguments (e.g. "[[3, 1, 2]]" for one list); include edge cases. Return values must be JSON: numbers, strings, booleans, lists, objects or null.
  hints: exactly 3, from a nudge to nearly the answer, never the full code. walkthrough: why the solution works.`;
const TERMINAL_RULES = `Each terminal lab runs in a simulated Linux shell (not a real one) and is graded by checks on the files and directory afterwards, so:
  files: 1-15 starting files with absolute paths (the learner starts in /home/learner), realistic content such as logs, configs or notes, each under 5,000 characters.
  The shell only has these commands: ${COMMANDS.join(", ")}. It supports pipes, > and >> redirects, ; and &&, quotes, ~ and * globs. No sudo, variables other than $HOME, loops, sed, awk or network.
  task: markdown that says what to do (e.g. "Find the failed logins in /var/log/auth.log and save the attacking IPs to ~/ips.txt").
  solution: the reference commands, one per entry, using only those commands; they must succeed when run in order.
  checks: 1-6, each with a short name shown to the learner and kind one of: exists (path exists; text "dir" or "file" to require a type, or ""), missing (path is gone), contains / lacks (the file at path does / doesn't contain text), cwd (the shell ends in directory text; path ""), output (the last command printed text; path ""). Checks must fail on the starting files and pass after the solution.
  hints: exactly 3, from a nudge to nearly the answer, never the full commands. walkthrough: why the solution works.`;
const LAB_RULES = `Each lab is graded by running the learner's SQL and comparing its rows with your solution's rows, so:
  setup: Postgres SQL that creates 1-3 log tables and inserts 30-200 rows of realistic synthetic logs (timestamps, hosts, users, IPs, event IDs) with the pattern to find hidden among normal noise. Plain CREATE TABLE and INSERT, or generate_series; nothing else.
  task: markdown that names the tables and asks one question a single SELECT answers ("Which IPs failed to log in more than 5 times?").
  solution: that single SELECT; it must return between 1 and 50 rows. starter: a partial query that does not answer it yet.
  hints: exactly 3, from a nudge to nearly the answer, never the full query. walkthrough: why the solution works.
  ordered: true only if the task asks for a specific order.`;
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
  const res = await client.beta.messages.parse({
    model: opts.model,
    max_tokens: opts.maxTokens,
    ...fallbackParams(opts.model), // security courses can trip cyber classifiers; reroute instead of failing
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
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
  if (!res.parsed_output) throw new GenerationError("A step came back incomplete.", usage);
  return { data: res.parsed_output as z.infer<T>, usage };
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
  labs: LabCounts,
  opts: Opts,
): Promise<{ data: GeneratedModule; usage: Usage }> {
  const maxTokens = Math.min(STEP_MAX_OUTPUT.module, opts.maxTokens ?? Infinity);
  if (process.env.KL_FAKE_AI === "1") return (await import("./fixtures")).fakeModule(outline.modules[index].title, maxTokens, labs);
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
- quiz: 4-6 multiple-choice questions with 4 choices each; answer is the 0-based index; explanation says why.
- labs: the number of log investigation labs the task asks for (often 0). ${LAB_RULES}
- codeLabs: the number of code labs the task asks for (often 0). ${CODE_RULES}
- terminalLabs: the number of terminal labs the task asks for (often 0). ${TERMINAL_RULES}`,
      task: `Write module ${index + 1}: "${m.title}". ${m.summary}
Objectives: ${m.objectives.join("; ")}
Labs: exactly ${labs.logs} log investigation lab${labs.logs === 1 ? "" : "s"}, ${labs.code} code lab${labs.code === 1 ? "" : "s"} and ${labs.terminal} terminal lab${labs.terminal === 1 ? "" : "s"}.`,
    },
    { ...opts, maxTokens },
  );
  if (!data.quiz.length || data.quiz.some((q) => q.choices.length < 2 || q.answer < 0 || q.answer >= q.choices.length)) {
    throw new GenerationError("The quiz is empty or has an invalid answer.", usage);
  }
  return { data, usage };
}

/** Asks for a fixed version of a lab whose reference solution failed validation. */
export async function repairLab<L extends LogsLab | CodeLab | TerminalLab>(c: CourseBrief, lab: L, error: string, opts: Opts): Promise<{ data: L; usage: Usage }> {
  const maxTokens = Math.min(STEP_MAX_OUTPUT.repair, opts.maxTokens ?? Infinity);
  if (process.env.KL_FAKE_AI === "1") return (await import("./fixtures")).fakeRepair(lab, maxTokens);
  const [schema, name, rules] = "checks" in lab ? [TerminalLab, "terminal", TERMINAL_RULES] : "entry" in lab ? [CodeLab, "code", CODE_RULES] : [LogsLab, "log investigation", LAB_RULES];
  return call(
    schema as unknown as z.ZodType<L>,
    `${brief(c)}

This ${name} lab failed its check: ${error}.
Return a corrected lab that keeps the same idea. ${rules}

The lab:
${JSON.stringify(lab)}`,
    { ...opts, maxTokens },
  );
}
