"use client";
import { useEffect, useState, useTransition } from "react";
import { motion } from "motion/react";
import { labHintAction, labSolutionAction, labSubmitAction } from "@/app/course/[id]/m/[n]/actions";
import { preloadPython, runCodeLab, type CodeRun } from "@/lib/labs/browser";
import type { PublicLab } from "@/lib/labs/types";
import type { LabResult, LabState } from "@/lib/player";
import { LabHelp, Verdict } from "./LabParts";
import { Markdown } from "./Markdown";

type Props = { courseId: string; position: number; index: number; lab: Extract<PublicLab, { kind: "code" }> & { state: LabState } };

const spring = { type: "spring", stiffness: 480, damping: 28 } as const;
const LANG = { python: "Python", javascript: "JavaScript" } as const;

/** Write one function; Run calls it with every test's arguments, Check sends the return values to be graded. */
export function CodeLab({ courseId, position, index, lab }: Props) {
  const [code, setCode] = useState(lab.starter);
  const [run, setRun] = useState<CodeRun | null>(null);
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<LabResult | null>(null);
  const [hints, setHints] = useState(lab.state.hintsShown);
  const [canSolve, setCanSolve] = useState(lab.state.canSolve);
  const [solution, setSolution] = useState(lab.state.solution);
  const [done, setDone] = useState(lab.state.done);
  const [best, setBest] = useState(lab.state.stars);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (lab.language === "python") preloadPython();
  }, [lab.language]);

  const execute = async () => {
    setRunning(true);
    setError(null);
    setVerdict(null); // the last verdict was for the code as it was then
    const r = await runCodeLab(lab.language, code, lab.entry, lab.tests.map((t) => t.args));
    setRunning(false);
    setRun(r);
    return r;
  };

  const check = () =>
    start(async () => {
      const r = await execute();
      if ("error" in r) return;
      const res = await labSubmitAction(courseId, position, index, { values: r.results.map((x) => x.value) });
      if (!res) return setError("Couldn't check that. Try again.");
      setVerdict(res);
      setCanSolve(res.canSolve);
      setBest(res.best);
      if (res.passed) setDone(true);
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
  const indent = lab.language === "python" ? "    " : "  ";
  const results = run && !("error" in run) ? run.results : null;
  const graded = verdict?.tests;

  return (
    <section aria-labelledby={`${id}-h`} className="kl-in flex flex-col gap-4 rounded-3xl border border-line bg-panel p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={`${id}-h`} className="font-display text-2xl font-extrabold">Lab: {lab.title}</h2>
        <span className="text-sm text-muted">{LANG[lab.language]}</span>
        {done && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className="ml-auto rounded-full bg-green/15 px-3 py-1 text-sm font-semibold text-green-ink">
            Cleared · {best} of 3 stars
          </motion.span>
        )}
      </div>
      <Markdown>{lab.task}</Markdown>

      <label htmlFor={`${id}-code`} className="sr-only">Your {LANG[lab.language]} code</label>
      <textarea
        id={`${id}-code`}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void execute();
            return;
          }
          if (e.key !== "Tab" || e.shiftKey) return; // Shift+Tab still leaves the editor for keyboard users
          e.preventDefault();
          const el = e.currentTarget;
          const { selectionStart: a, selectionEnd: b } = el;
          setCode(code.slice(0, a) + indent + code.slice(b));
          requestAnimationFrame(() => el.setSelectionRange(a + indent.length, a + indent.length));
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={Math.min(18, Math.max(6, code.split("\n").length + 1))}
        className="w-full resize-y rounded-2xl border-2 border-line bg-panel-2 p-4 font-mono text-sm leading-6 outline-none transition-colors focus:border-blue"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <motion.button type="button" whileTap={{ scale: 0.97, y: 2 }} onClick={() => void execute()} disabled={running || pending} className="h-12 rounded-2xl bg-blue px-6 font-bold text-white shadow-[0_4px_0_#2f6fc2] disabled:opacity-50">
          {running && !pending ? "Running…" : "Run"}
        </motion.button>
        <motion.button type="button" whileTap={{ scale: 0.97, y: 2 }} onClick={check} disabled={running || pending} className="h-12 rounded-2xl bg-green px-6 font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] disabled:opacity-50">
          {pending ? "Checking…" : "Check answer"}
        </motion.button>
        <span className="hidden text-sm text-muted sm:ml-auto sm:inline">Tab indents · Ctrl or ⌘ + Enter runs</span>
      </div>

      {(error || (run && "error" in run)) && (
        <motion.p role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} className="rounded-2xl bg-pink/15 p-3 font-mono text-sm">
          {error ?? (run && "error" in run ? run.error : "")}
        </motion.p>
      )}

      {verdict && <Verdict verdict={verdict} courseId={courseId} />}

      <div className="overflow-x-auto rounded-2xl bg-panel-2" aria-live="polite">
        <table className="min-w-full text-left text-sm">
          <caption className="sr-only">Tests</caption>
          <thead>
            <tr>
              <th className="border-b border-line px-3 py-2 font-semibold text-muted">Test</th>
              <th className="border-b border-line px-3 py-2 font-semibold text-muted">Call</th>
              <th className="border-b border-line px-3 py-2 font-semibold text-muted">Returned</th>
            </tr>
          </thead>
          <tbody>
            {lab.tests.map((t, i) => {
              const r = results?.[i];
              const pass = graded?.[i]?.pass;
              return (
                <tr key={i}>
                  <td className="border-b border-line px-3 py-2">
                    <span className={pass == null ? "" : pass ? "text-green-ink" : "text-pink-ink"}>
                      {pass == null ? "" : pass ? "✓ " : "✗ "}
                      {t.name}
                    </span>
                  </td>
                  <td className="border-b border-line px-3 py-2 font-mono">
                    {lab.entry}({t.args.slice(1, -1)})
                  </td>
                  <td className="border-b border-line px-3 py-2 font-mono">
                    {r ? r.error ? <span className="text-pink-ink">{r.error}</span> : r.value : <span className="text-muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {run && !("error" in run) && run.stdout && (
        <div className="rounded-2xl bg-panel-2 p-3">
          <p className="text-sm font-semibold text-muted">Printed</p>
          <pre className="mt-1 max-h-48 overflow-auto text-sm"><code>{run.stdout}</code></pre>
        </div>
      )}

      <LabHelp hints={hints} total={lab.hints} canSolve={canSolve} solution={solution} done={done} pending={pending} onHint={hint} onReveal={reveal} onUse={setCode} />
    </section>
  );
}
