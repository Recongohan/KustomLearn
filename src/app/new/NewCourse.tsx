"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pip } from "@/components/Pip";
import type { Variation } from "@/lib/ai/intake";
import type { PricedModel } from "@/lib/ai/pricing";
import { formatUsd } from "@/lib/ai/pricing";
import { estimate, formatTokens } from "@/lib/estimate";
import { createCourseAction, understandAction, type UnderstandState } from "./actions";

const EXAMPLES = [
  "SOC analyst from zero, about an hour a day",
  "Docker and Kubernetes for my new job in 4 weeks",
  "Python for data analysis, I already know Excel",
  "Prep for the AWS Solutions Architect exam",
];
const THINKING = ["Reading your goal…", "Sketching three paths…", "Picking the right labs…", "Balancing your timeline…"];
const ACCENTS = ["#4f9dff", "#ffc23d", "#ff4f7b"];
const spring = { type: "spring", stiffness: 420, damping: 32 } as const;

type Ok = Extract<UnderstandState, { ok: true }>;

export function NewCourse({ model }: { model: PricedModel }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Ok | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [draft, setDraft] = useState<Variation | null>(null);
  const [thinking, startThinking] = useTransition();
  const [saving, startSaving] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const hadResult = useRef(false);

  // The view swaps out under the keyboard focus: move it to the new view's heading, or back to the question.
  useEffect(() => {
    if (thinking) return;
    if (result) heading.current?.focus();
    else if (hadResult.current) textarea.current?.focus();
    hadResult.current = !!result;
  }, [thinking, result]);

  const submit = () =>
    startThinking(async () => {
      setError(null);
      const r = await understandAction(text);
      if (!r.ok) return setError(r.message);
      setResult(r);
      setPicked(null);
      setDraft(null);
    });

  const pick = (i: number) => {
    setPicked(i);
    setDraft(structuredClone(result!.intake.variations[i]));
    // On phones the tuning panel sits below all three cards; bring it into view.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => document.getElementById("tune")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 150);
  };

  const lockIn = () =>
    startSaving(async () => {
      const r = await createCourseAction({ request: result!.request, intent: result!.intake.intent, category: result!.intake.category, variation: draft! });
      if (r && !r.ok) setError(r.message);
    });

  if (thinking) return <Thinking />;

  if (!result)
    return (
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6 py-4 md:py-10">
        <div className="flex items-end gap-4">
          <Pip size={72} />
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">What do you want to learn?</h1>
        </div>
        <label htmlFor="request" className="text-muted">Describe it like you&apos;d tell a friend: what, why, and how much time you have.</label>
        <textarea
          ref={textarea}
          id="request"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && submit()}
          rows={4}
          maxLength={2000}
          placeholder="I want to become a SOC analyst. I know basic networking and can study an hour a day."
          className="w-full resize-none rounded-3xl border-2 border-line bg-panel p-5 text-lg outline-none transition-colors focus:border-blue"
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <motion.button key={ex} type="button" whileTap={{ scale: 0.95 }} onClick={() => setText(ex)} className="min-h-11 rounded-full bg-panel-2 px-4 text-sm font-medium text-muted hover:text-text">
              {ex}
            </motion.button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <motion.button
            type="button"
            onClick={submit}
            disabled={text.trim().length < 8}
            whileTap={{ scale: 0.97, y: 2 }}
            className="h-14 rounded-2xl bg-green px-7 text-lg font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] disabled:opacity-40"
          >
            Build my 3 options
          </motion.button>
          <span className="text-sm text-muted">One quick AI call, about 3K tokens.</span>
        </div>
        <ErrorLine error={error} />
      </motion.section>
    );

  const { intake } = result;
  if (!intake.inScope)
    return (
      <div className="flex flex-col items-start gap-4 rounded-3xl border border-line bg-panel p-6">
        <h1 ref={heading} tabIndex={-1} className="font-display text-2xl font-extrabold outline-none">That one&apos;s outside my world</h1>
        <p className="text-muted">{intake.outOfScopeReason}</p>
        <button type="button" onClick={() => setResult(null)} className="h-12 rounded-2xl bg-text px-5 font-bold text-bg">Try another topic</button>
      </div>
    );

  const est = draft ? estimate(draft, model) : null;

  return (
    <section className="flex flex-col gap-6">
      <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-panel-2 px-3 py-1 font-semibold text-blue-ink">{intake.category}</span>
          <span className="text-muted">Designed with {formatTokens(result.tokens)} tokens</span>
          <button type="button" onClick={() => setResult(null)} className="ml-auto min-h-11 px-2 font-medium text-muted underline-offset-4 hover:underline">Change my answer</button>
        </div>
        <h1 ref={heading} tabIndex={-1} className="font-display text-3xl font-extrabold leading-tight tracking-tight outline-none md:text-4xl">{intake.intent}</h1>
        <p className="text-muted">Pick a path. You can tune it before anything is built.</p>
      </motion.header>

      <div className="grid gap-4 md:grid-cols-3">
        {intake.variations.map((v, i) => (
          <motion.button
            key={v.name}
            type="button"
            aria-pressed={picked === i}
            onClick={() => pick(i)}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: picked === null || picked === i ? 1 : 0.6, y: 0, scale: 1 }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            transition={{ ...spring, delay: picked === null ? 0.08 * i : 0 }}
            className="relative flex flex-col gap-3 rounded-3xl border border-line bg-panel p-5 text-left"
          >
            {picked === i && <motion.span layoutId="pick-ring" transition={spring} className="pointer-events-none absolute -inset-px rounded-3xl border-[3px]" style={{ borderColor: ACCENTS[i] }} />}
            <span className="h-2 w-12 rounded-full" style={{ background: ACCENTS[i] }} />
            <span className="font-display text-xl font-extrabold">{v.name}</span>
            <span className="text-muted">{v.pitch}</span>
            <span className="flex flex-wrap gap-1.5 text-xs font-semibold">
              <Chip>{v.level[0].toUpperCase() + v.level.slice(1)}</Chip>
              <Chip>{v.weeks} wk · {v.hoursPerWeek} h/wk</Chip>
              <Chip>{v.modules} modules</Chip>
              <Chip>{v.labs.code + v.labs.terminal + v.labs.logs} labs</Chip>
              {v.capstone && <Chip>Boss capstone</Chip>}
            </span>
            <ul className="flex flex-col gap-1 text-sm">
              {v.outcomes.map((o) => (
                <li key={o} className="flex gap-2"><span aria-hidden="true" className="text-green-ink">✓</span>{o}</li>
              ))}
            </ul>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {draft && est && (
          <motion.section
            key="tweak"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={spring}
            id="tune"
            aria-label="Tune your course"
            className="flex flex-col gap-5 rounded-3xl border border-line bg-panel p-5 md:p-6"
          >
            <h2 className="font-display text-xl font-extrabold">Tune {draft.name}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Stepper label="Weeks" value={draft.weeks} min={1} max={12} onChange={(weeks) => setDraft({ ...draft, weeks })} />
              <Stepper label="Hours per week" value={draft.hoursPerWeek} min={1} max={20} onChange={(hoursPerWeek) => setDraft({ ...draft, hoursPerWeek })} />
              <Stepper label="Modules" value={draft.modules} min={3} max={16} onChange={(modules) => setDraft({ ...draft, modules })} />
              <Stepper label="Code labs" value={draft.labs.code} min={0} max={30} onChange={(code) => setDraft({ ...draft, labs: { ...draft.labs, code } })} />
              <Stepper label="Terminal labs" value={draft.labs.terminal} min={0} max={30} onChange={(terminal) => setDraft({ ...draft, labs: { ...draft.labs, terminal } })} />
              <Stepper label="Log labs" value={draft.labs.logs} min={0} max={30} onChange={(logs) => setDraft({ ...draft, labs: { ...draft.labs, logs } })} />
            </div>
            <div className="flex flex-wrap gap-3">
              <div role="group" aria-label="Level" className="flex rounded-2xl bg-panel-2 p-1">
                {(["beginner", "intermediate", "advanced"] as const).map((l) => (
                  <button key={l} type="button" aria-pressed={draft.level === l} onClick={() => setDraft({ ...draft, level: l })} className="relative h-11 rounded-xl px-4 text-sm font-semibold capitalize text-muted aria-pressed:text-bg">
                    {draft.level === l && <motion.span layoutId="level-pill" transition={spring} className="absolute inset-0 rounded-xl bg-text" />}
                    <span className="relative">{l}</span>
                  </button>
                ))}
              </div>
              <button type="button" aria-pressed={draft.capstone} onClick={() => setDraft({ ...draft, capstone: !draft.capstone })} className="h-12 rounded-2xl border border-line px-4 text-sm font-semibold aria-pressed:border-pink aria-pressed:text-pink-ink">
                {draft.capstone ? "Boss capstone on" : "Add a boss capstone"}
              </button>
            </div>

            <div className="flex flex-col gap-4 rounded-2xl bg-panel-2 p-4 md:flex-row md:items-center">
              <div className="flex-1">
                <p className="text-sm text-muted">Building it once uses about</p>
                <motion.p key={est.capTokens} initial={{ scale: 1.08 }} animate={{ scale: 1 }} className="font-display text-3xl font-extrabold">
                  {formatTokens(est.lowTokens)}–{formatTokens(est.highTokens)} tokens
                </motion.p>
                <p className="text-sm text-muted">
                  Stops at {formatTokens(est.capTokens)} and asks before using more. After that the course runs with no AI calls.
                  <span className="block text-xs opacity-80">About {formatUsd(est.lowMicros)}–{formatUsd(est.highMicros)} on your Anthropic bill.</span>
                </p>
              </div>
              <motion.button
                type="button"
                onClick={lockIn}
                disabled={saving}
                whileTap={{ scale: 0.97, y: 2 }}
                className="h-14 rounded-2xl bg-green px-7 text-lg font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] disabled:opacity-60"
              >
                {saving ? "Locking in…" : "Lock in this plan"}
              </motion.button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
      <ErrorLine error={error} />
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-panel-2 px-2.5 py-1">{children}</span>;
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-panel-2 px-4 py-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="h-11 w-11 rounded-xl text-xl font-bold disabled:opacity-30">−</button>
        <motion.span key={value} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} aria-live="polite" className="w-8 text-center font-display text-lg font-extrabold tabular-nums">{value}</motion.span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="h-11 w-11 rounded-xl text-xl font-bold disabled:opacity-30">+</button>
      </div>
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return (
    <AnimatePresence>
      {error && (
        <motion.p role="alert" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} exit={{ opacity: 0 }} className="font-semibold text-pink-ink">
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <div role="status" className="flex flex-col items-center gap-6 py-20 text-center">
      <Pip size={120} fill={((i % 6) + 1) / 6} />
      <AnimatePresence mode="wait">
        <motion.p key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="font-display text-2xl font-extrabold">
          {THINKING[i % THINKING.length]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
