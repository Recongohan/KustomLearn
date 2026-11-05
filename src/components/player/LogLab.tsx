"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { motion } from "motion/react";
import type { PGlite } from "@electric-sql/pglite";
import { labHintAction, labSolutionAction, labSubmitAction } from "@/app/course/[id]/m/[n]/actions";
import { toResultSet } from "@/lib/labs/grade";
import type { PublicLab, ResultSet } from "@/lib/labs/types";
import type { LabResult, LabState } from "@/lib/player";
import { LabHelp, Verdict } from "./LabParts";
import { Markdown } from "./Markdown";

type Props = { courseId: string; position: number; index: number; lab: Extract<PublicLab, { kind: "logs" }> & { state: LabState } };
type Table = { name: string; columns: string[]; rows: number };

const spring = { type: "spring", stiffness: 480, damping: 28 } as const;
const SHOW_ROWS = 50;

/** A log investigation: the lab's tables live in an in-browser Postgres, so queries run instantly and offline. */
export function LogLab({ courseId, position, index, lab }: Props) {
  const db = useRef<PGlite | null>(null);
  const [tables, setTables] = useState<Table[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState(lab.starter);
  const [result, setResult] = useState<ResultSet | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<LabResult | null>(null);
  const [hints, setHints] = useState(lab.state.hintsShown);
  const [canSolve, setCanSolve] = useState(lab.state.canSolve);
  const [solution, setSolution] = useState(lab.state.solution);
  const [done, setDone] = useState(lab.state.done);
  const [best, setBest] = useState(lab.state.stars);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { PGlite } = await import("@electric-sql/pglite");
        const pg = new PGlite();
        await pg.exec(lab.setup);
        const cols = await pg.query<{ table_name: string; column_name: string }>(
          "select table_name, column_name from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position",
        );
        const byTable = new Map<string, string[]>();
        for (const c of cols.rows) byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), c.column_name]);
        const list: Table[] = [];
        for (const [name, columns] of byTable) {
          const n = await pg.query<{ n: number }>(`select count(*)::int as n from "${name.replace(/"/g, '""')}"`);
          list.push({ name, columns, rows: n.rows[0].n });
        }
        if (!live) return void pg.close();
        db.current = pg;
        setTables(list);
      } catch {
        if (live) setLoadError(true);
      }
    })();
    return () => {
      live = false;
      void db.current?.close();
      db.current = null;
    };
  }, [lab.setup]);

  const run = async (): Promise<ResultSet | null> => {
    if (!db.current) return null;
    setRunError(null);
    setVerdict(null); // the last verdict was for the query as it was then
    try {
      const r = await db.current.query<unknown[]>(query, [], { rowMode: "array" });
      const set = toResultSet(r.fields, r.rows);
      setResult(set);
      return set;
    } catch (e) {
      setResult(null);
      setRunError(e instanceof Error ? e.message : String(e));
      return null;
    }
  };

  const check = () =>
    start(async () => {
      const set = await run();
      if (!set) return;
      const r = await labSubmitAction(courseId, position, index, { rows: { columns: set.columns, rows: set.rows.slice(0, 1000).map((row) => row.slice(0, 50)) } });
      if (!r) return setRunError("Couldn't check that. Try again.");
      setVerdict(r);
      setCanSolve(r.canSolve);
      setBest(r.best);
      if (r.passed) setDone(true);
    });

  const hint = () =>
    start(async () => {
      const r = await labHintAction(courseId, position, index);
      if (!r) return;
      setHints(r.hintsShown);
      setCanSolve(r.canSolve);
    });

  const reveal = () =>
    start(async () => {
      const r = await labSolutionAction(courseId, position, index);
      if (r) setSolution(r);
    });

  const id = `lab-${index}`;
  return (
    <section aria-labelledby={`${id}-h`} className="kl-in flex flex-col gap-4 rounded-3xl border border-line bg-panel p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={`${id}-h`} className="font-display text-2xl font-extrabold">Lab: {lab.title}</h2>
        <span className="text-sm text-muted">Log investigation</span>
        {done && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className="ml-auto rounded-full bg-green/15 px-3 py-1 text-sm font-semibold text-green-ink">
            Cleared · {best} of 3 stars
          </motion.span>
        )}
      </div>
      <Markdown>{lab.task}</Markdown>

      <div aria-live="polite">
        {loadError ? (
          <p className="rounded-2xl bg-pink/15 p-3">The lab database couldn&apos;t start in this browser. Reload the page to try again.</p>
        ) : !tables ? (
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-track border-t-blue" aria-hidden="true" />
            Loading the logs…
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label="Tables">
            {tables.map((t) => (
              <li key={t.name} className="rounded-2xl bg-panel-2 px-3 py-2 text-sm">
                <span className="font-semibold">{t.name}</span> <span className="text-muted">· {t.rows} rows</span>
                <code className="mt-1 block text-xs text-muted">{t.columns.join(", ")}</code>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label htmlFor={`${id}-sql`} className="sr-only">Your SQL query</label>
      <textarea
        id={`${id}-sql`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
          e.preventDefault();
          void run();
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={Math.min(12, Math.max(4, query.split("\n").length + 1))}
        className="w-full resize-y rounded-2xl border-2 border-line bg-panel-2 p-4 font-mono text-base leading-6 outline-none transition-colors focus:border-blue md:text-sm"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <motion.button type="button" whileTap={{ scale: 0.97, y: 2 }} onClick={() => void run()} disabled={!tables || pending} className="h-12 rounded-2xl bg-blue px-6 font-bold text-white shadow-[0_4px_0_#2f6fc2] disabled:opacity-50">
          Run
        </motion.button>
        <motion.button type="button" whileTap={{ scale: 0.97, y: 2 }} onClick={check} disabled={!tables || pending} className="h-12 rounded-2xl bg-green px-6 font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] disabled:opacity-50">
          {pending ? "Checking…" : "Check answer"}
        </motion.button>
        <span className="hidden text-sm text-muted sm:ml-auto sm:inline">Ctrl or ⌘ + Enter runs the query</span>
      </div>

      {runError && (
        <motion.p role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} className="rounded-2xl bg-pink/15 p-3 font-mono text-sm">
          {runError}
        </motion.p>
      )}

      {verdict && <Verdict verdict={verdict} courseId={courseId} />}

      {result && (
        <div className="overflow-x-auto rounded-2xl bg-panel-2">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>{result.columns.map((c, i) => <th key={i} className="border-b border-line px-3 py-2 font-semibold text-muted">{c}</th>)}</tr>
            </thead>
            <tbody>
              {result.rows.slice(0, SHOW_ROWS).map((r, i) => (
                <tr key={i}>{r.map((v, j) => <td key={j} className="border-b border-line px-3 py-1.5 font-mono tabular-nums">{v ?? <span className="text-muted">null</span>}</td>)}</tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-muted">{result.rows.length > SHOW_ROWS ? `First ${SHOW_ROWS} of ${result.rows.length} rows` : `${result.rows.length} row${result.rows.length === 1 ? "" : "s"}`}</p>
        </div>
      )}

      <LabHelp hints={hints} total={lab.hints} canSolve={canSolve} solution={solution} done={done} pending={pending} onHint={hint} onReveal={reveal} onUse={setQuery} />
    </section>
  );
}
