import { z } from "zod";

/** A log investigation: synthetic log tables, a question, and one SQL query that answers it. */
export const LogsLab = z.object({
  title: z.string(),
  task: z.string(), // markdown: what to find in the logs
  setup: z.string(), // Postgres SQL that creates and fills the log tables
  starter: z.string(), // a partial query the learner starts from
  solution: z.string(), // the reference query
  walkthrough: z.string(), // markdown: why the solution works
  hints: z.array(z.string()), // three tiers, from a nudge to nearly the answer
  ordered: z.boolean(), // true only when the task asks for a specific order
});
export type LogsLab = z.infer<typeof LogsLab>;

export type ResultSet = { columns: string[]; rows: (string | null)[][] };

/** A code lab: write one function; it is called with each test's arguments and its return value is compared. */
export const CodeLab = z.object({
  title: z.string(),
  task: z.string(), // markdown: what the function must do, with an example
  language: z.enum(["python", "javascript"]),
  entry: z.string(), // the function's name
  starter: z.string(), // a stub with the signature
  solution: z.string(), // the reference implementation
  walkthrough: z.string(),
  hints: z.array(z.string()),
  tests: z.array(z.object({ name: z.string(), args: z.string() })), // args: a JSON array of the call's arguments
});
export type CodeLab = z.infer<typeof CodeLab>;

/** A terminal lab: a simulated Linux shell over starting files; graded by checks on the final state. */
export const TerminalCheck = z.object({
  name: z.string(),
  kind: z.enum(["exists", "missing", "contains", "lacks", "cwd", "output"]), // output: the last command printed `text`
  path: z.string(), // the file or directory the check is about ("" for cwd and output)
  text: z.string(), // what it must contain, or the directory for cwd
});
export const TerminalLab = z.object({
  title: z.string(),
  task: z.string(),
  files: z.array(z.object({ path: z.string(), content: z.string() })), // absolute paths; the learner starts in /home/learner
  solution: z.array(z.string()), // the reference commands, one per line
  walkthrough: z.string(),
  hints: z.array(z.string()),
  checks: z.array(TerminalCheck),
});
export type TerminalLab = z.infer<typeof TerminalLab>;
export type TerminalCheck = z.infer<typeof TerminalCheck>;

/** Labs as stored after generation: validated, with the reference results kept server-side for grading. */
export type StoredLab = (LogsLab & { kind: "logs"; expected: ResultSet }) | (CodeLab & { kind: "code"; expected: string[] }) | (TerminalLab & { kind: "terminal" });

/** What the browser gets: enough to work, nothing that gives the answer away. */
export type PublicLab =
  | { kind: "logs"; title: string; task: string; setup: string; starter: string; hints: number }
  | { kind: "code"; title: string; task: string; language: CodeLab["language"]; entry: string; starter: string; tests: CodeLab["tests"]; hints: number }
  | { kind: "terminal"; title: string; task: string; files: TerminalLab["files"]; checks: string[]; hints: number };

/** One test of a code run: the return value as canonical JSON, or the error it raised. */
export type CodeOutcome = { value: string | null; error: string | null };

export type LabTest = { name: string; pass: boolean };
