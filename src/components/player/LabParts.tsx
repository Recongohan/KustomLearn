"use client";
import { AnimatePresence, motion } from "motion/react";
import type { LabResult } from "@/lib/player";
import { Markdown } from "./Markdown";

const spring = { type: "spring", stiffness: 480, damping: 28 } as const;

/** The graded tests, one chip each, and what clearing the lab opened. */
export function Verdict({ verdict, courseId }: { verdict: LabResult; courseId: string }) {
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <ul className={`grid gap-2 ${verdict.tests.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`} aria-label="Tests">
        {verdict.tests.map((t, i) => (
          <motion.li
            key={`${t.name}-${i}`}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...spring, delay: i * 0.08 }}
            className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold ${t.pass ? "bg-green/15 text-green-ink" : "bg-pink/15 text-pink-ink"}`}
          >
            <span aria-hidden="true">{t.pass ? "✓" : "✗"}</span>
            <span className="min-w-0 truncate">{t.name}</span>
            <span className="sr-only">{t.pass ? "passed" : "failed"}</span>
          </motion.li>
        ))}
      </ul>
      <p className="font-display text-lg font-extrabold">
        {verdict.passed ? (verdict.stars === 3 ? "Perfect, first try with no hints" : "Lab cleared") : `${verdict.tests.filter((t) => t.pass).length} of ${verdict.tests.length} tests pass`}
      </p>
      {verdict.passed && verdict.next != null && (
        <a href={`/course/${courseId}/m/${verdict.next + 1}`} className="flex h-12 w-fit items-center rounded-2xl bg-green px-6 font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62]">Next level</a>
      )}
    </div>
  );
}

type HelpProps = {
  hints: string[];
  total: number;
  canSolve: boolean;
  solution: { solution: string; walkthrough: string } | null;
  done: boolean;
  pending: boolean;
  onHint: () => void;
  onReveal: () => void;
  onUse: (code: string) => void;
};

/** Tiered hints, then the solution with its walkthrough once it unlocks. */
export function LabHelp({ hints, total, canSolve, solution, done, pending, onHint, onReveal, onUse }: HelpProps) {
  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {hints.map((h, i) => (
          <motion.p key={i} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="rounded-2xl bg-gold/10 p-3 text-sm">
            <span className="font-semibold text-gold-ink">Hint {i + 1}: </span>
            {h}
          </motion.p>
        ))}
      </AnimatePresence>
      <div className="flex flex-wrap gap-2">
        {hints.length < total && !solution && (
          <button type="button" onClick={onHint} disabled={pending} className="min-h-11 rounded-xl bg-panel-2 px-4 text-sm font-semibold">
            Get a hint ({hints.length + 1} of {total}){hints.length < 2 && !done ? " · costs a star" : ""}
          </button>
        )}
        {canSolve && !solution && (
          <button type="button" onClick={onReveal} disabled={pending} className="min-h-11 rounded-xl bg-panel-2 px-4 text-sm font-semibold text-muted">
            Show the solution · caps this lab at 1 star
          </button>
        )}
      </div>
      {solution && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2 rounded-2xl bg-panel-2 p-4">
          <p className="font-semibold">Solution</p>
          <pre className="overflow-x-auto text-sm"><code>{solution.solution}</code></pre>
          <Markdown>{solution.walkthrough}</Markdown>
          <button type="button" onClick={() => onUse(solution.solution)} className="min-h-11 w-fit rounded-xl border border-line px-4 text-sm font-semibold">Put it in the editor</button>
        </motion.div>
      )}
    </div>
  );
}
