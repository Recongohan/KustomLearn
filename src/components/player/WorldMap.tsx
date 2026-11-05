"use client";
import Link from "next/link";
import { motion } from "motion/react";
import type { MapModule } from "@/lib/player";

type Props = { id: string; title: string; intent: string; category: string; capstone: boolean; hoursPerWeek: number; modules: MapModule[]; today: string };

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

export function WorldMap({ id, title, intent, category, capstone, hoursPerWeek, modules, today }: Props) {
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

        {/* Wide screens: the strip from the design, left to right. It scrolls inside its frame if a course is long. */}
        <div className="mt-5 hidden overflow-x-auto pb-2 lg:block">
          <ol className="grid" style={{ gridTemplateColumns: `repeat(${modules.length}, minmax(88px, 1fr))` }}>
            {modules.map((m, i) => (
              <motion.li key={m.position} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 16) * 0.04 }} className="flex flex-col gap-2">
                <div className="flex h-14 items-center">
                  <LevelNode id={id} m={m} i={i} boss={capstone && i === modules.length - 1} now={m === current} size="sm" />
                  {i < modules.length - 1 && <span aria-hidden="true" className={`mx-1.5 h-1.5 flex-1 rounded-full ${m.done ? "bg-green" : "bg-track"}`} />}
                </div>
                <span className="flex gap-0.5" aria-hidden="true">{[0, 1, 2].map((k) => <Star key={k} on={k < m.stars} size={12} />)}</span>
                <span className={`line-clamp-2 pr-2 text-xs leading-4 ${m === current ? "font-bold text-blue-ink" : m.unlocked ? "font-medium" : "text-muted"}`}>{shortName(m.title)}</span>
              </motion.li>
            ))}
          </ol>
        </div>

        {/* Phones and tablets: the same levels as a vertical path with full titles. */}
        <ol className="mt-5 flex flex-col lg:hidden">
          {modules.map((m, i) => {
            const now = m === current;
            const d = due(m, today);
            return (
              <motion.li
                key={m.position}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: Math.min(i, 12) * 0.05 }}
                className="grid grid-cols-[64px_1fr] gap-x-4"
              >
                <div className="flex flex-col items-center">
                  <LevelNode id={id} m={m} i={i} boss={capstone && i === modules.length - 1} now={now} size="lg" />
                  {i < modules.length - 1 && <span aria-hidden="true" className={`my-1 h-8 w-1.5 rounded-full ${m.done ? "bg-green" : "bg-track"}`} />}
                </div>
                <div className="pt-2.5 pb-4">
                  <p className={`font-semibold leading-snug ${m.unlocked ? "" : "text-muted"} ${now ? "text-blue-ink" : ""}`}>{m.title}</p>
                  {m.summary && <p className="mt-0.5 hidden max-w-prose text-sm text-muted md:block">{m.summary}</p>}
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

      <Schedule id={id} modules={modules} today={today} hoursPerWeek={hoursPerWeek} />
    </div>
  );
}

/** "Module 3: Brute force" reads as "Brute force" under a numbered node. */
const shortName = (title: string) => title.replace(/^(module|level|unit|week|part)\s*\d+\s*[:.\-–]\s*/i, "");

function LevelNode({ id, m, i, boss, now, size }: { id: string; m: MapModule; i: number; boss: boolean; now: boolean; size: "sm" | "lg" }) {
  const tone = m.done
    ? "bg-green text-[#06281a] shadow-[inset_0_-4px_0_#1a9a62]"
    : boss && m.unlocked
      ? "bg-pink text-white shadow-[inset_0_-4px_0_#c22c55]"
      : now
        ? "kl-now bg-blue text-white shadow-[inset_0_-4px_0_#2f6fc2]"
        : "border-2 border-track bg-panel-2 text-muted";
  const box = size === "lg" ? "h-16 w-16 rounded-[20px]" : "h-12 w-12 rounded-2xl";
  const icon = size === "lg" ? 24 : 20;
  const face = m.done ? (
    <svg aria-hidden="true" width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
  ) : boss ? (
    <svg aria-hidden="true" width={icon} height={icon} viewBox="0 0 24 24" fill="currentColor"><path d="M3 18 5 7l4.5 4L12 4l2.5 7L19 7l2 11z" /></svg>
  ) : m.unlocked ? (
    <span className={`font-display font-extrabold ${size === "lg" ? "text-xl" : "text-lg"}`}>{i + 1}</span>
  ) : (
    <span className={`font-display font-extrabold ${size === "lg" ? "text-lg" : "text-base"}`}>{i + 1}</span>
  );
  const label = `${boss ? "Boss level" : `Level ${i + 1}`}: ${m.title}. ${m.done ? `Cleared, ${m.stars} of 3 stars` : m.unlocked ? "Open" : "Locked"}`;
  if (!m.unlocked) return <span role="img" aria-label={label} className={`grid shrink-0 place-items-center ${box} ${tone}`}>{face}</span>;
  return (
    <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94, y: 2 }} className="shrink-0">
      <Link href={`/course/${id}/m/${i + 1}`} aria-label={label} className={`grid place-items-center ${box} ${tone}`}>{face}</Link>
    </motion.div>
  );
}

const DAY = 86_400_000;
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY;
const short = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" });
const fromNum = (n: number) => short.format(new Date(n * DAY));

/** The dated plan, week by week, with this week marked. */
function Schedule({ id, modules, today, hoursPerWeek }: { id: string; modules: MapModule[]; today: string; hoursPerWeek: number }) {
  const dated = modules.filter((m) => m.scheduledOn);
  if (!dated.length) return null;
  const start = dayNum(dated[0].scheduledOn!);
  const now = dayNum(today);
  const weeks = new Map<number, MapModule[]>();
  for (const m of dated) {
    const w = Math.floor((dayNum(m.scheduledOn!) - start) / 7);
    weeks.set(w, [...(weeks.get(w) ?? []), m]);
  }
  const thisWeek = Math.floor((now - start) / 7);
  const overdue = dated.filter((m) => !m.done && m.scheduledOn! < today).length;
  const last = dated[dated.length - 1].scheduledOn!;

  return (
    <section aria-labelledby="plan-h" className="rounded-3xl border border-line bg-panel p-5 md:p-6">
      <h2 id="plan-h" className="font-display text-xl font-extrabold">Schedule</h2>
      <p className="mt-1 text-sm text-muted">
        {hoursPerWeek} h a week · ends {formatDay(last)}
        {overdue > 0 && <> · <span className="text-pink-ink">{overdue} behind</span></>}
      </p>
      <ol className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {[...weeks.entries()].map(([w, ms]) => {
          const current = w === thisWeek;
          return (
            <li key={w} className={`rounded-2xl p-3 ${current ? "bg-blue/10 ring-2 ring-blue/40" : "bg-panel-2"}`}>
              <p className="flex items-baseline justify-between gap-2 text-sm">
                <span className={`font-semibold ${current ? "text-blue-ink" : ""}`}>{current ? "This week" : `Week ${w + 1}`}</span>
                <span className="tabular-nums text-muted">{fromNum(start + w * 7)} – {fromNum(start + w * 7 + 6)}</span>
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {ms.map((m) => (
                  <li key={m.position} className="flex items-center gap-2 text-sm">
                    <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${m.done ? "bg-green" : m.unlocked ? "bg-blue" : "bg-track"}`} />
                    {m.unlocked ? (
                      <Link href={`/course/${id}/m/${m.position + 1}`} className="min-w-0 flex-1 truncate py-1 hover:underline">{m.title}</Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate py-1 text-muted">{m.title}</span>
                    )}
                    <span className="shrink-0 text-muted">{m.done ? "Done" : formatDay(m.scheduledOn!).split(",")[0]}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
