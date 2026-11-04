"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { checkAction, submitAction } from "@/app/course/[id]/m/[n]/actions";
import type { QuizResult } from "@/lib/player";

type Props = { courseId: string; position: number; questions: { question: string; choices: string[] }[]; best: number };
type Checked = { correct: boolean; answer: number; explanation: string };

const spring = { type: "spring", stiffness: 480, damping: 26 } as const;

function Star({ on, i }: { on: boolean; i: number }) {
  return (
    <motion.svg
      aria-hidden="true"
      width="44"
      height="44"
      viewBox="0 0 24 24"
      fill={on ? "#ffc23d" : "var(--track)"}
      initial={{ scale: 0, rotate: -30 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ ...spring, delay: 0.25 + i * 0.18 }}
    >
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
    </motion.svg>
  );
}

export function Quiz({ courseId, position, questions, best }: Props) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const q = questions[index];

  const check = () =>
    start(async () => {
      if (choice == null) return;
      setError(null);
      const r = await checkAction(courseId, position, index, choice);
      if (!r) return setError("Couldn't check that answer. Try again.");
      setChecked(r);
      setAnswers((a) => [...a, choice]);
    });

  const next = () =>
    start(async () => {
      if (index + 1 < questions.length) {
        setIndex(index + 1);
        setChoice(null);
        setChecked(null);
        return;
      }
      setError(null);
      const r = await submitAction(courseId, position, answers);
      if (!r) return setError("Couldn't save your result. Try again.");
      setResult(r);
      router.refresh(); // the map behind this page now shows the new stars and the next level
    });

  const retry = () => {
    setIndex(0);
    setChoice(null);
    setChecked(null);
    setAnswers([]);
    setResult(null);
  };

  return (
    <section aria-labelledby="quiz-h" className="flex flex-col gap-5 rounded-3xl border border-line bg-panel p-5 md:p-6">
      <div className="flex items-center gap-4">
        <h2 id="quiz-h" className="font-display text-2xl font-extrabold">Quiz</h2>
        {!result && q && (
          <div className="flex flex-1 items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answers.length}>
              <motion.div className="h-full rounded-full bg-green" animate={{ width: `${(answers.length / questions.length) * 100}%` }} transition={spring} />
            </div>
            <span className="text-sm tabular-nums text-muted">{index + 1}/{questions.length}</span>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {result ? (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring} className="flex flex-col items-start gap-4" aria-live="polite">
            <div className="flex gap-2" role="img" aria-label={`${result.stars} of 3 stars`}>
              {[0, 1, 2].map((k) => <Star key={k} on={k < result.stars} i={k} />)}
            </div>
            <p className="font-display text-2xl font-extrabold">
              {result.passed ? (result.stars === 3 ? "Perfect clear" : "Level cleared") : "Not cleared yet"}
            </p>
            <p className="text-muted">
              <span className="tabular-nums">{result.correct.filter(Boolean).length} of {result.correct.length}</span> right.{" "}
              {result.passed
                ? result.best > result.stars ? `Your best here stays at ${result.best} stars.` : result.next != null ? "The next level is open." : result.last ? "That was the last level." : "Clear this level's labs to open the next one."
                : `Get ${Math.ceil(result.correct.length * 0.7)} right to open the next level.`}
            </p>
            <div className="flex w-full flex-col gap-3 sm:flex-row">
              {result.next != null && (
                <Link href={`/course/${courseId}/m/${result.next + 1}`} className="flex h-14 items-center justify-center rounded-2xl bg-green px-7 text-lg font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] transition-transform hover:-translate-y-px active:translate-y-0.5">
                  Next level
                </Link>
              )}
              {!result.passed && (
                <button type="button" onClick={retry} className="h-14 rounded-2xl bg-blue px-7 text-lg font-bold text-white shadow-[0_4px_0_#2f6fc2] transition-transform hover:-translate-y-px active:translate-y-0.5">
                  Try again
                </button>
              )}
              <Link href={`/course/${courseId}`} className="flex h-14 items-center justify-center rounded-2xl bg-panel-2 px-7 font-bold">
                World map
              </Link>
            </div>
          </motion.div>
        ) : !q ? (
          // A course built before empty quizzes were rejected: let the learner clear the level after reading it.
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-start gap-4">
            <p className="text-muted">This level has no quiz questions.</p>
            <button type="button" onClick={next} disabled={pending} className="h-14 rounded-2xl bg-green px-7 text-lg font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] transition-transform hover:-translate-y-px active:translate-y-0.5 disabled:opacity-60">
              {pending ? "Saving…" : "Finish level"}
            </button>
          </motion.div>
        ) : (
          <motion.div key={index} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={spring} className="flex flex-col gap-4">
            <p className="text-lg font-semibold" id={`q-${index}`}>{q.question}</p>
            <div role="radiogroup" aria-labelledby={`q-${index}`} className="flex flex-col gap-2">
              {q.choices.map((c, i) => {
                const picked = choice === i;
                const right = checked && i === checked.answer;
                const wrong = checked && picked && !checked.correct;
                const tone = right
                  ? "border-green bg-green/15"
                  : wrong
                    ? "border-pink bg-pink/15"
                    : picked
                      ? "border-blue bg-blue/10"
                      : "border-line bg-panel-2 hover:border-track";
                return (
                  <motion.button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    disabled={!!checked || pending}
                    onClick={() => setChoice(i)}
                    whileTap={checked ? undefined : { scale: 0.98 }}
                    animate={wrong ? { x: [0, -8, 8, -4, 0] } : right && picked ? { scale: [1, 1.03, 1] } : {}}
                    transition={{ duration: 0.35 }}
                    className={`flex min-h-12 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors ${tone}`}
                  >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm font-bold ${picked || right ? "bg-text text-bg" : "bg-track text-muted"}`}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span>{c}</span>
                  </motion.button>
                );
              })}
            </div>

            <div aria-live="polite">
              {checked && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className={`rounded-2xl p-4 ${checked.correct ? "bg-green/15" : "bg-pink/15"}`}>
                  <p className={`font-display text-lg font-extrabold ${checked.correct ? "text-green-ink" : "text-pink-ink"}`}>{checked.correct ? "Correct" : "Not quite"}</p>
                  <p className="mt-1">{checked.explanation}</p>
                </motion.div>
              )}
            </div>

            {checked ? (
              <button type="button" onClick={next} disabled={pending} className="h-14 rounded-2xl bg-green px-7 text-lg font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] transition-transform hover:-translate-y-px active:translate-y-0.5 disabled:opacity-60 sm:w-fit">
                {index + 1 < questions.length ? "Continue" : pending ? "Saving…" : "See result"}
              </button>
            ) : (
              <button type="button" onClick={check} disabled={choice == null || pending} className="h-14 rounded-2xl bg-blue px-7 text-lg font-bold text-white shadow-[0_4px_0_#2f6fc2] transition-transform hover:-translate-y-px active:translate-y-0.5 disabled:opacity-50 sm:w-fit">
                {pending ? "Checking…" : "Check"}
              </button>
            )}
            {best > 0 && <p className="text-sm text-muted">Your best here: {best} of 3 stars.</p>}
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p role="alert" className="font-semibold text-pink-ink">{error}</p>}
    </section>
  );
}
