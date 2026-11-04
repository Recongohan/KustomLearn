import "server-only";
import { Worker } from "node:worker_threads";
import { gradeResult, toResultSet } from "./grade";
import { IDENT, canonical, runJs } from "./harness";
import { getQuickJS } from "./quickjs-node";
import { runPython } from "./run-python";
import type { CodeLab, CodeOutcome, LogsLab, ResultSet } from "./types";

const TIMEOUT_MS = 10_000;
const MAX_SETUP = 60_000; // characters of SQL
const MAX_ROWS = 500;

// Runs in its own thread with an in-memory database, so model-written SQL can't touch the app's data,
// and a runaway query is killed by terminate() instead of blocking the server. An eval worker resolves the
// bare import from the working directory, which keeps the bundler from rewriting it.
const WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  const run = async (sql) => { const r = await db.query(sql, [], { rowMode: "array" }); return { fields: r.fields.map((f) => ({ name: f.name })), rows: r.rows }; };
  try {
    await db.exec(workerData.setup);
    const solution = await run(workerData.solution);
    let starter = null;
    try { if (workerData.starter.trim()) starter = await run(workerData.starter); } catch {}
    parentPort.postMessage({ ok: true, solution, starter });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: String((e && e.message) || e) });
  }
})();`;

type RawResult = { fields: { name: string }[]; rows: unknown[][] };
type WorkerReply = { ok: true; solution: RawResult; starter: RawResult | null } | { ok: false; error: string };

function runInWorker(lab: LogsLab): Promise<WorkerReply> {
  return new Promise((resolve) => {
    const w = new Worker(WORKER, { eval: true, workerData: { setup: lab.setup, solution: lab.solution, starter: lab.starter }, resourceLimits: { maxOldGenerationSizeMb: 512 } });
    const done = (r: WorkerReply) => (clearTimeout(t), void w.terminate(), resolve(r));
    const t = setTimeout(() => done({ ok: false, error: `took longer than ${TIMEOUT_MS / 1000}s` }), TIMEOUT_MS);
    w.once("message", done);
    w.once("error", (e) => done({ ok: false, error: e.message }));
    w.once("exit", (code) => done({ ok: false, error: `stopped (exit ${code})` }));
  });
}

/** Runs the reference solution against the lab's own data. Returns its result to grade against, or why the lab is broken. */
export async function validateLab(lab: LogsLab): Promise<{ ok: true; expected: ResultSet } | { ok: false; error: string }> {
  if (lab.setup.length > MAX_SETUP) return { ok: false, error: "the setup SQL is too long" };
  if (lab.hints.length < 1) return { ok: false, error: "it has no hints" };
  const r = await runInWorker(lab);
  if (!r.ok) return { ok: false, error: `the SQL failed: ${r.error}` };
  const expected = toResultSet(r.solution.fields, r.solution.rows);
  if (!expected.rows.length) return { ok: false, error: "the solution returns no rows" };
  if (expected.rows.length > MAX_ROWS) return { ok: false, error: `the solution returns over ${MAX_ROWS} rows` };
  if (r.starter && gradeResult(expected, toResultSet(r.starter.fields, r.starter.rows), lab.ordered).every((t) => t.pass)) {
    return { ok: false, error: "the starter query already gives the answer" };
  }
  return { ok: true, expected };
}

const MAX_CODE = 20_000;

/** Normalises each test's arguments to plain JSON, or says which test is malformed. */
export function normaliseTests(tests: CodeLab["tests"]): string[] | string {
  const out: string[] = [];
  for (const t of tests) {
    try {
      const v = JSON.parse(t.args);
      if (!Array.isArray(v)) return `test "${t.name}" has arguments that are not a JSON array`;
      out.push(JSON.stringify(v));
    } catch {
      return `test "${t.name}" has arguments that are not valid JSON`;
    }
  }
  return out;
}

async function runCode(lab: CodeLab, codes: string[], args: string[]): Promise<({ results: CodeOutcome[] } | { error: string })[]> {
  if (lab.language === "python") return runPython(codes, lab.entry, args);
  const qjs = await getQuickJS();
  return codes.map((code) => runJs(qjs, code, lab.entry, args));
}

/** Runs the reference solution on every test; its return values become what the learner's code must match. */
export async function validateCodeLab(lab: CodeLab): Promise<{ ok: true; expected: string[]; tests: CodeLab["tests"] } | { ok: false; error: string }> {
  if (!IDENT.test(lab.entry)) return { ok: false, error: "the function name is not a valid identifier" };
  if (lab.tests.length < 3 || lab.tests.length > 12) return { ok: false, error: "it needs between 3 and 12 tests" };
  if (lab.solution.length > MAX_CODE || lab.starter.length > MAX_CODE) return { ok: false, error: "the code is too long" };
  if (lab.hints.length < 1) return { ok: false, error: "it has no hints" };
  const args = normaliseTests(lab.tests);
  if (typeof args === "string") return { ok: false, error: args };
  let runs;
  try {
    runs = await runCode(lab, [lab.solution, lab.starter], args);
  } catch (e) {
    return { ok: false, error: `the code could not run: ${e instanceof Error ? e.message : String(e)}` };
  }
  const [solution, starter] = runs;
  if ("error" in solution) return { ok: false, error: `the solution failed: ${solution.error}` };
  const failed = solution.results.findIndex((r) => r.error != null || r.value == null);
  if (failed >= 0) return { ok: false, error: `the solution fails test "${lab.tests[failed].name}": ${solution.results[failed].error ?? "no value"}` };
  let expected: string[];
  try {
    expected = solution.results.map((r) => canonical(r.value!));
  } catch {
    return { ok: false, error: "the solution returns a value that is not JSON" };
  }
  if (!("error" in starter) && starter.results.every((r, i) => r.value != null && safeCanonical(r.value) === expected[i])) {
    return { ok: false, error: "the starter code already passes every test" };
  }
  return { ok: true, expected, tests: lab.tests.map((t, i) => ({ name: t.name, args: args[i] })) };
}

export function safeCanonical(v: string): string | null {
  try {
    return canonical(v);
  } catch {
    return null;
  }
}
