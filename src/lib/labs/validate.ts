import "server-only";
import { Worker } from "node:worker_threads";
import { gradeResult, toResultSet } from "./grade";
import type { LogsLab, ResultSet } from "./types";

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
