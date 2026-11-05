"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { motion } from "motion/react";
import { labHintAction, labSolutionAction, labSubmitAction } from "@/app/course/[id]/m/[n]/actions";
import { HOME, createShell, exec, type Shell } from "@/lib/labs/shell";
import type { PublicLab } from "@/lib/labs/types";
import type { LabResult, LabState } from "@/lib/player";
import { LabHelp, Verdict } from "./LabParts";
import { Markdown } from "./Markdown";

type Props = { courseId: string; position: number; index: number; lab: Extract<PublicLab, { kind: "terminal" }> & { state: LabState } };
type Line = { prompt: string; cmd: string; out: string; err: string };

const spring = { type: "spring", stiffness: 480, damping: 28 } as const;
const MAX_COMMANDS = 300; // what the server replays
const promptFor = (sh: Shell) => `learner@lab:${sh.cwd === HOME ? "~" : sh.cwd.startsWith(HOME + "/") ? "~" + sh.cwd.slice(HOME.length) : sh.cwd}$`;

/**
 * A simulated shell over the lab's starting files. Commands run here for instant output; Check sends the
 * whole session, which the server replays from the same starting files to grade it.
 */
export function TerminalLab({ courseId, position, index, lab }: Props) {
  const [first] = useState(() => createShell(lab.files));
  const shell = useRef<Shell>(first);
  const [prompt, setPrompt] = useState(() => promptFor(first));
  const [session, setSession] = useState<string[]>([]); // every command since the last reset, in order
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState<number | null>(null); // position in history while pressing up/down
  const [verdict, setVerdict] = useState<LabResult | null>(null);
  const [hints, setHints] = useState(lab.state.hintsShown);
  const [canSolve, setCanSolve] = useState(lab.state.canSolve);
  const [solution, setSolution] = useState(lab.state.solution);
  const [done, setDone] = useState(lab.state.done);
  const [best, setBest] = useState(lab.state.stars);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const screen = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    screen.current?.scrollTo({ top: screen.current.scrollHeight });
  }, [lines]);

  const runLines = (cmds: string[], base: string[], shown: Line[]) => {
    const sh = shell.current;
    const next = [...shown];
    for (const cmd of cmds) {
      const prompt = promptFor(sh);
      const r = exec(sh, cmd);
      if (cmd.trim() === "clear") next.length = 0;
      else next.push({ prompt, cmd, out: r.out, err: r.err });
    }
    setPrompt(promptFor(sh));
    setSession([...base, ...cmds]);
    setLines(next.slice(-200)); // scrollback only; the session keeps every command
    setVerdict(null); // the last verdict was for the session as it was then
  };

  const submit = () => {
    if (session.length >= MAX_COMMANDS) return setError(`That's ${MAX_COMMANDS} commands. Reset to start a fresh session.`);
    setError(null);
    setCursor(null);
    setInput("");
    runLines([input], session, lines);
  };

  const reset = () => {
    shell.current = createShell(lab.files);
    setPrompt(promptFor(shell.current));
    setSession([]);
    setLines([]);
    setVerdict(null);
    setError(null);
    field.current?.focus();
  };

  const history = session.filter((c) => c.trim());
  const recall = (dir: -1 | 1) => {
    if (!history.length) return;
    const at = cursor == null ? (dir < 0 ? history.length - 1 : null) : cursor + dir;
    if (at == null || at >= history.length) return (setCursor(null), setInput(""));
    const i = Math.max(0, at);
    setCursor(i);
    setInput(history[i]);
  };

  const check = () =>
    start(async () => {
      setError(null);
      const res = await labSubmitAction(courseId, position, index, { commands: session }).catch(() => null);
      if (!res) return setError("Couldn't check that. Try again.");
      setVerdict(res);
      setCanSolve(res.canSolve);
      setBest(res.best);
      if (res.passed) setDone(true);
    });

  const hint = () =>
    start(async () => {
      const r = await labHintAction(courseId, position, index).catch(() => null);
      if (!r) return setError("Couldn't load a hint. Try again.");
      setHints(r.hintsShown);
      setCanSolve(r.canSolve);
    });

  const reveal = () =>
    start(async () => {
      const r = await labSolutionAction(courseId, position, index).catch(() => null);
      if (r) setSolution(r);
      else setError("Couldn't open the solution. Try again.");
    });

  // Runs the reference commands in a fresh session, so the learner can watch what each one does.
  const useSolution = (text: string) => {
    shell.current = createShell(lab.files);
    runLines(text.split("\n"), [], []);
    field.current?.focus();
  };

  const id = `lab-${index}`;
  const passes = verdict?.tests;

  return (
    <section aria-labelledby={`${id}-h`} className="kl-in flex flex-col gap-4 rounded-3xl border border-line bg-panel p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={`${id}-h`} className="font-display text-2xl font-extrabold">Lab: {lab.title}</h2>
        <span className="text-sm text-muted">Terminal</span>
        {done && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className="ml-auto rounded-full bg-green/15 px-3 py-1 text-sm font-semibold text-green-ink">
            Cleared · {best} of 3 stars
          </motion.span>
        )}
      </div>
      <Markdown>{lab.task}</Markdown>

      <div>
        <p className="text-sm font-semibold text-muted">Checks</p>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Checks">
          {lab.checks.map((name, i) => {
            const pass = passes?.[i]?.pass;
            return (
              <li key={i} className={`rounded-full px-3 py-1 text-sm font-medium ${pass == null ? "bg-panel-2" : pass ? "bg-green/15 text-green-ink" : "bg-pink/15 text-pink-ink"}`}>
                {pass == null ? "" : pass ? "✓ " : "✗ "}
                {name}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Clicking anywhere on the screen puts the cursor in the prompt, like a real terminal. */}
      <div onClick={() => field.current?.focus()} className="overflow-hidden rounded-2xl border-2 border-line bg-[#0b1020] font-mono text-sm leading-6 text-[#d7e0f5] focus-within:border-blue">
        <div ref={screen} role="log" aria-live="polite" aria-label="Terminal output" className="max-h-80 min-h-40 overflow-y-auto p-4">
          {!lines.length && <p className="text-[#8a96b8]">Type <span className="text-[#9fe0b8]">help</span> to see the commands. Your files are in ~ and around the system.</p>}
          {lines.map((l, i) => (
            <div key={i}>
              <p className="break-all whitespace-pre-wrap">
                <span className="text-[#9fe0b8]">{l.prompt}</span> {l.cmd}
              </p>
              {l.out && <pre className="break-all whitespace-pre-wrap">{l.out}</pre>}
              {l.err && <pre className="break-all whitespace-pre-wrap text-[#ff9db5]">{l.err}</pre>}
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-center gap-2 border-t border-white/10 px-4 py-2"
        >
          <label htmlFor={`${id}-cmd`} className="max-w-[55%] shrink-0 truncate text-[#9fe0b8]">
            {prompt}
            <span className="sr-only"> command</span>
          </label>
          <input
            ref={field}
            id={`${id}-cmd`}
            value={input}
            onChange={(e) => (setInput(e.target.value), setCursor(null))}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                recall(e.key === "ArrowUp" ? -1 : 1);
              } else if (e.key === "l" && e.ctrlKey) {
                e.preventDefault();
                setLines([]);
              }
            }}
            maxLength={2000}
            enterKeyHint="send"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 bg-transparent text-base kl-term-input md:text-sm"
          />
        </form>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <motion.button type="button" whileTap={{ scale: 0.97, y: 2 }} onClick={check} disabled={pending || !session.length} className="h-12 rounded-2xl bg-green px-6 font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] disabled:opacity-50">
          {pending ? "Checking…" : "Check my work"}
        </motion.button>
        <motion.button type="button" whileTap={{ scale: 0.97, y: 2 }} onClick={reset} disabled={pending} className="h-12 rounded-2xl border border-line px-6 font-bold">
          Reset files
        </motion.button>
        <span className="hidden text-sm text-muted sm:ml-auto sm:inline">↑ ↓ history · Ctrl + L clears the screen</span>
      </div>

      {error && (
        <motion.p role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} className="rounded-2xl bg-pink/15 p-3 text-sm">
          {error}
        </motion.p>
      )}

      {verdict && <Verdict verdict={verdict} courseId={courseId} chips={false} />}

      <LabHelp hints={hints} total={lab.hints} canSolve={canSolve} solution={solution} done={done} pending={pending} onHint={hint} onReveal={reveal} onUse={useSolution} useLabel="Run it in the terminal" />
    </section>
  );
}
