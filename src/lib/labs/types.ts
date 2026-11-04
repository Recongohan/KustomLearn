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

/** A lab as stored after generation: validated, with the reference result kept server-side for grading. */
export type StoredLab = LogsLab & { kind: "logs"; expected: ResultSet };

/** What the browser gets: enough to build the tables and work, nothing that gives the answer away. */
export type PublicLab = { kind: "logs"; title: string; task: string; setup: string; starter: string; hints: number };

export type LabTest = { name: string; pass: boolean };
