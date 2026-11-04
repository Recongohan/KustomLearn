"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pip } from "@/components/Pip";
import type { Variation } from "@/lib/ai/intake";
import { estimate, formatTokens } from "@/lib/estimate";
import type { Progress } from "@/lib/generation";
import { getProgress, startGeneration } from "./actions";

type Props = { id: string; intent: string; category: string; variation: Variation; initial: Progress };
const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

export function CourseLive({ id, intent, category, variation, initial }: Props) {
  const [p, setP] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Poll while building; stop as soon as it settles.
  useEffect(() => {
    if (p.status !== "generating") return;
    const t = setInterval(async () => {
      const next = await getProgress(id);
      if (next) setP(next);
    }, 1500);
    return () => clearInterval(t);
  }, [id, p.status]);

  const go = (raiseCap = false) =>
    start(async () => {
      setError(null);
      const r = await startGeneration(id, raiseCap);
      if (!r.ok) return setError(r.message ?? "Couldn't start.");
      setP((prev) => ({ ...prev, status: "generating", statusNote: null }));
    });

  const done = p.modules.filter((m) => m.done).length;
  const steps = p.totalModules + 1;
  const finished = (p.modules.length ? 1 : 0) + done;
  const capPct = p.capTokens ? Math.min(100, (p.spentTokens / p.capTokens) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="w-fit rounded-full bg-panel-2 px-3 py-1 text-sm font-semibold text-blue-ink">{category}</span>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">{p.title}</h1>
        <p className="text-lg text-muted">{intent}</p>
      </header>

      {p.status === "draft" && (
        <section className="flex flex-col gap-5 rounded-3xl border border-line bg-panel p-5 md:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Timeline" value={`${variation.weeks} wk · ${variation.hoursPerWeek} h/wk`} />
            <Stat label="Modules" value={String(variation.modules)} />
            <Stat label="Token budget" value={`${formatTokens(p.capTokens || estimate(variation, "claude-opus-5-5").capTokens)} max`} />
          </div>
          <BigButton onClick={() => go()} disabled={pending}>{pending ? "Starting…" : "Build my course"}</BigButton>
          <p className="text-sm text-muted">This is the one time AI runs for this course. Safe to close the tab while it builds.</p>
        </section>
      )}

      {(p.status === "generating" || p.status === "partial" || p.status === "failed") && (
        <section className="flex flex-col gap-5 rounded-3xl border border-line bg-panel p-5 md:p-6" aria-live="polite">
          <div className="flex items-center gap-5">
            <Pip size={88} fill={Math.max(0.05, finished / steps)} />
            <div className="flex-1">
              <p className="font-display text-2xl font-extrabold">
                {p.status === "generating" ? `Building… ${finished} of ${steps} steps` : p.status === "partial" ? "Paused" : "Stopped"}
              </p>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow={Math.round(capPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Tokens used of your cap">
                <motion.div className="h-full rounded-full bg-gold" animate={{ width: `${capPct}%` }} transition={spring} />
              </div>
              <p className="mt-1 text-sm text-muted">{formatTokens(p.spentTokens)} of {formatTokens(p.capTokens)} tokens</p>
            </div>
          </div>

          <ol className="flex flex-col gap-2">
            <Step label="Course outline" state={p.modules.length ? "done" : p.status === "generating" ? "active" : "todo"} />
            {Array.from({ length: p.totalModules }, (_, i) => {
              const m = p.modules[i];
              const prevDone = i === 0 ? p.modules.length > 0 : p.modules[i - 1]?.done;
              return <Step key={i} label={m?.title ?? `Module ${i + 1}`} state={m?.done ? "done" : p.status === "generating" && prevDone ? "active" : "todo"} />;
            })}
          </ol>

          {p.statusNote && <p className="rounded-2xl bg-panel-2 p-3 text-sm">{p.statusNote}</p>}
          {p.status === "partial" && <BigButton onClick={() => go(true)} disabled={pending}>Approve 30% more tokens and finish</BigButton>}
          {p.status === "failed" && <BigButton onClick={() => go()} disabled={pending}>Resume</BigButton>}
          {p.status === "generating" && <p className="text-sm text-muted">Safe to close this tab. It keeps building.</p>}
        </section>
      )}

      {p.status === "ready" && (
        <motion.section initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring} className="flex flex-col gap-4 rounded-3xl border border-line bg-panel p-5 md:p-6">
          <div className="flex items-center gap-4">
            <Pip size={72} fill={1} />
            <div>
              <p className="font-display text-2xl font-extrabold">Your course is ready</p>
              <p className="text-muted">{p.modules.length} modules · built with {formatTokens(p.spentTokens)} tokens · no more AI calls from here</p>
            </div>
          </div>
          <BigButton onClick={() => router.refresh()}>Open the world map</BigButton>
        </motion.section>
      )}

      <AnimatePresence>
        {error && (
          <motion.p role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} exit={{ opacity: 0 }} className="font-semibold text-pink-ink">
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-panel-2 p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display text-lg font-extrabold">{value}</p>
    </div>
  );
}

function BigButton({ children, ...props }: React.ComponentProps<typeof motion.button>) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.97, y: 2 }} className="h-14 w-full rounded-2xl bg-green px-7 text-lg font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] disabled:opacity-60 sm:w-fit" {...props}>
      {children}
    </motion.button>
  );
}

function Step({ label, state }: { label: string; state: "done" | "active" | "todo" }) {
  return (
    <li className="flex items-center gap-3">
      <span className="relative grid h-7 w-7 shrink-0 place-items-center">
        {state === "done" ? (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className="grid h-7 w-7 place-items-center rounded-full bg-green text-sm font-bold text-[#06281a]" aria-label="done">✓</motion.span>
        ) : state === "active" ? (
          <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-track border-t-blue" aria-label="in progress" />
        ) : (
          <span className="h-3 w-3 rounded-full bg-track" aria-label="waiting" />
        )}
      </span>
      <span className={state === "todo" ? "text-muted" : "font-semibold"}>{label}</span>
    </li>
  );
}
