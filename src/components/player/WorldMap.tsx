"use client";
import Link from "next/link";
import { motion } from "motion/react";
import type { MapModule } from "@/lib/player";

type Props = { id: string; title: string; intent: string; category: string; capstone: boolean; modules: MapModule[]; today: string };

const spring = { type: "spring", stiffness: 420, damping: 28 } as const;
const fmt = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const formatDay = (d: string) => fmt.format(new Date(`${d}T00:00:00Z`));

function Star({ on, size = 14 }: { on: boolean; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={on ? "#ffc23d" : "var(--track)"}>
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
    </svg>
  );
}

function due(m: MapModule, today: string) {
  if (!m.scheduledOn) return null;
  if (m.done) return { text: formatDay(m.scheduledOn), tone: "text-muted" };
  if (m.scheduledOn < today) return { text: `Was due ${formatDay(m.scheduledOn)}`, tone: "text-pink-ink" };
  if (m.scheduledOn === today) return { text: "Due today", tone: "text-gold-ink" };
  return { text: formatDay(m.scheduledOn), tone: "text-muted" };
}

export function WorldMap({ id, title, intent, category, capstone, modules, today }: Props) {
  const stars = modules.reduce((n, m) => n + m.stars, 0);
  const current = modules.find((m) => m.unlocked && !m.done);
  const cleared = modules.filter((m) => m.done).length;
  const next = current && due(current, today);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="w-fit rounded-full bg-panel-2 px-3 py-1 text-sm font-semibold text-blue-ink">{category}</span>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h1>
        <p className="text-lg text-muted">{intent}</p>
      </header>

      <section aria-labelledby="next-h" className="flex flex-col gap-4 rounded-3xl border border-line bg-panel p-5 md:flex-row md:items-center md:p-6">
        <div className="flex-1">
          <h2 id="next-h" className="font-display text-xl font-extrabold">
            {current ? `Next up: ${current.title}` : "Every level cleared"}
          </h2>
          <p className="mt-1 text-muted">
            <span className="tabular-nums">{cleared} of {modules.length}</span> levels cleared ·{" "}
            <span className="tabular-nums">{stars} of {modules.length * 3}</span> stars
            {next && <> · <span className={next.tone}>{next.text}</span></>}
          </p>
        </div>
        {current && (
          <motion.div whileTap={{ scale: 0.97, y: 2 }} className="w-full md:w-auto">
            <Link
              href={`/course/${id}/m/${current.position + 1}`}
              className="flex h-14 items-center justify-center rounded-2xl bg-green px-7 text-lg font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] transition-transform hover:-translate-y-px"
            >
              {cleared ? "Continue" : "Start"}
            </Link>
          </motion.div>
        )}
      </section>

      <section aria-labelledby="map-h" className="rounded-3xl border border-line bg-panel p-5 md:p-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="map-h" className="font-display text-xl font-extrabold">World map</h2>
          <span className="text-sm text-muted">Clear a level to open the next · 3 stars for a perfect first try</span>
        </div>
        <ol className="mt-5 flex flex-col">
          {modules.map((m, i) => {
            const boss = capstone && i === modules.length - 1;
            const now = m === current;
            const d = due(m, today);
            const node = m.done
              ? "bg-green text-[#06281a] shadow-[inset_0_-4px_0_#1a9a62]"
              : boss && m.unlocked
                ? "bg-pink text-white shadow-[inset_0_-4px_0_#c22c55]"
                : now
                  ? "kl-now bg-blue text-white shadow-[inset_0_-4px_0_#2f6fc2]"
                  : "border-2 border-track bg-panel-2 text-muted";
            const face = m.done ? (
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            ) : boss ? (
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18 5 7l4.5 4L12 4l2.5 7L19 7l2 11z" /></svg>
            ) : m.unlocked ? (
              <span className="font-display text-xl font-extrabold">{i + 1}</span>
            ) : (
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            );
            const label = `${boss ? "Boss level" : `Level ${i + 1}`}: ${m.title}. ${m.done ? `Cleared, ${m.stars} of 3 stars` : m.unlocked ? "Open" : "Locked"}`;
            return (
              <motion.li
                key={m.position}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: Math.min(i, 12) * 0.05 }}
                className="grid grid-cols-[64px_1fr] gap-x-4"
              >
                <div className="flex flex-col items-center">
                  {m.unlocked ? (
                    <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94, y: 2 }}>
                      <Link href={`/course/${id}/m/${i + 1}`} aria-label={label} className={`grid h-16 w-16 place-items-center rounded-[20px] ${node}`}>
                        {face}
                      </Link>
                    </motion.div>
                  ) : (
                    <span role="img" aria-label={label} className={`grid h-16 w-16 place-items-center rounded-[20px] ${node}`}>{face}</span>
                  )}
                  {i < modules.length - 1 && <span aria-hidden="true" className={`my-1 h-8 w-1.5 rounded-full ${m.done ? "bg-green" : "bg-track"}`} />}
                </div>
                <div className="pt-2.5 pb-4">
                  <p className={`font-semibold leading-snug ${m.unlocked ? "" : "text-muted"} ${now ? "text-blue-ink" : ""}`}>{m.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="flex gap-0.5" aria-hidden="true">
                      {[0, 1, 2].map((k) => <Star key={k} on={k < m.stars} />)}
                    </span>
                    {d && <span className={d.tone}>{d.text}</span>}
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
