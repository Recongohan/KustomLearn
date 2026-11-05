// Server-rendered pieces of the game screens. Motion is CSS (kl-in, kl-grow, kl-bar), which reduced motion stops.
import Link from "next/link";
import type { GameSummary } from "@/lib/gameplay";
import type { HomeCourse } from "@/lib/player";
import { Pip } from "../Pip";

export const RANK_COLORS = ["#8b8f98", "#c0763a", "#b8c4d6", "#f2b632", "#5fd4d0", "#22c55e"];
const fmtDay = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });
const dayLetter = (d: string) => fmtDay.format(new Date(`${d}T00:00:00Z`)).slice(0, 1);
const n = (x: number) => x.toLocaleString("en-US");

export function Panel({ title, aside, children, className = "", delay = 0 }: { title?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <section className={`kl-in flex flex-col gap-4 rounded-3xl border border-line bg-panel p-5 ${className}`} style={{ animationDelay: `${delay}ms` }} aria-label={title}>
      {title && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-display text-xl font-extrabold">{title}</h2>
          {aside && <span className="text-sm text-muted">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Flame({ size = 22, lit = true }: { size?: number; lit?: boolean }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={lit ? "#ff7a2f" : "var(--track)"}>
      <path d="M12 2c1.2 3.6 6 5.8 6 11.3A6 6 0 0 1 6 13.3c0-2.4 1.2-4.2 2.4-5.4 0 2.4 1.2 3.6 2.4 3.6 0-3.6-1.2-6 1.2-9.5z" />
    </svg>
  );
}

export function Shield({ tier, size = 40 }: { tier: number; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size * 1.12} viewBox="0 0 40 45">
      <path d="M20 2l16 6v12c0 11-7 18-16 22C11 38 4 31 4 20V8z" fill={RANK_COLORS[tier]} />
      <path d="M20 12l8 9-8 12-8-12z" fill="#fff" opacity="0.55" />
    </svg>
  );
}

export function Bar({ value, of, color, h = 10, label }: { value: number; of: number; color: string; h?: number; label: string }) {
  const pct = of > 0 ? Math.min(100, (value / of) * 100) : 0;
  return (
    <div className="w-full overflow-hidden rounded-full bg-track" style={{ height: h }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={of} aria-valuenow={Math.min(value, of)}>
      <div className="kl-grow h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

const MARK: Record<string, string> = { studied: "bg-orange", frozen: "bg-blue", missed: "bg-pink/25", today: "border-2 border-dashed border-orange", future: "border-2 border-dashed border-track" };

export function StreakCard({ g, delay }: { g: GameSummary; delay?: number }) {
  const s = g.streak;
  return (
    <Panel delay={delay} className="bg-[color-mix(in_srgb,#ff7a2f_9%,var(--panel))]">
      <div className="flex items-center gap-3">
        <Flame size={34} lit={s.days > 0} />
        <p className="font-display text-5xl font-extrabold tabular-nums leading-none">{s.days}</p>
        <p className="font-display text-lg font-extrabold leading-tight">day<br />streak</p>
      </div>
      <ol className="grid grid-cols-7 gap-1.5" aria-label="This week">
        {g.week.map((d) => (
          <li key={d.day} className="flex flex-col items-center gap-1">
            <span className={`grid aspect-square w-full max-w-9 place-items-center rounded-xl ${MARK[d.mark ?? "future"] ?? "bg-track"}`}>
              {d.mark === "studied" && <Flame size={16} lit={false} />}
              {d.mark === "frozen" && <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0e0f12" strokeWidth="2.4" strokeLinecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" /></svg>}
            </span>
            <span className={`text-xs ${d.day === g.day ? "font-bold text-text" : "text-muted"}`}>{dayLetter(d.day)}</span>
            <span className="sr-only">{d.mark === "studied" ? "studied" : d.mark === "frozen" ? "freeze used" : d.mark === "missed" ? "missed" : d.mark === "today" ? "today, not yet" : "upcoming"}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">
        Best {s.best} {s.best === 1 ? "day" : "days"} · {s.freezes} streak {s.freezes === 1 ? "freeze" : "freezes"} left
        {!s.studiedToday && s.days > 0 ? " · study today to keep it" : ""}
      </p>
    </Panel>
  );
}

export function LevelCard({ g, delay }: { g: GameSummary; delay?: number }) {
  const l = g.level;
  return (
    <Panel delay={delay}>
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gold font-display text-2xl font-extrabold text-[#3a2700] shadow-[inset_0_-4px_0_rgba(0,0,0,0.18)]">{l.level}</span>
        <div className="min-w-0">
          <p className="text-sm text-muted">Level {l.level}</p>
          <p className="truncate font-display text-xl font-extrabold">{l.name}</p>
        </div>
        <p className="ml-auto text-right font-display text-xl font-extrabold tabular-nums">{n(g.xp)}<span className="block text-xs font-medium text-muted">XP</span></p>
      </div>
      <Bar value={l.into} of={l.to - l.from} color="#ffc23d" h={12} label={`XP to level ${l.level + 1}`} />
      <p className="text-sm text-muted">
        <span className="font-semibold text-text tabular-nums">{n(l.need)} XP</span> to level {l.level + 1}, {l.next}
      </p>
    </Panel>
  );
}

export function GoalCard({ g, delay }: { g: GameSummary; delay?: number }) {
  const { minutes, of } = g.goal;
  const full = minutes >= of;
  return (
    <Panel delay={delay} className="flex-row items-center">
      <Pip size={72} fill={Math.max(0.04, minutes / of)} />
      <div className="min-w-0">
        <h2 className="font-display text-xl font-extrabold">Daily goal</h2>
        <p className="text-sm text-muted">
          <span className="font-semibold text-text tabular-nums">{Math.min(minutes, of)} of {of} min</span>. {full ? "Pip is full. Nice work." : "Pip fills up while you study a lesson or lab."}
        </p>
      </div>
    </Panel>
  );
}

export function RankChip({ g }: { g: GameSummary }) {
  const r = g.rank;
  return (
    <Link href="/ranks" className="kl-in flex min-h-16 items-center gap-3 rounded-3xl border border-line bg-panel px-4 py-3 transition-transform hover:-translate-y-px active:translate-y-px">
      <Shield tier={r.tier} size={32} />
      <span className="min-w-0">
        <span className="block font-display text-lg font-extrabold">{r.name} rank</span>
        <span className="block text-sm text-muted">{r.next ? `${r.next.in} more ${r.next.in === 1 ? "day" : "days"} of streak to ${r.next.name}` : "The top rank"}</span>
      </span>
      <svg aria-hidden="true" className="ml-auto shrink-0 text-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>
    </Link>
  );
}

export function WeekChart({ g, delay }: { g: GameSummary; delay?: number }) {
  const total = g.week.reduce((s, d) => s + d.xp, 0);
  const max = Math.max(50, ...g.week.map((d) => d.xp));
  return (
    <Panel title="XP this week" aside={`${n(total)} so far · ${n(g.lastWeek)} last week`} delay={delay}>
      <ol className="grid h-40 grid-cols-7 items-end gap-2" aria-label="XP by day">
        {g.week.map((d, i) => {
          const today = d.day === g.day;
          return (
            <li key={d.day} className="flex h-full flex-col items-center justify-end gap-1.5">
              <span className={`text-xs tabular-nums ${today ? "font-bold text-gold-ink" : "text-muted"}`}>{d.mark === "future" ? "" : d.xp}</span>
              <span
                className="kl-bar w-full max-w-10 rounded-lg"
                style={{ height: `${Math.max(6, (d.xp / max) * 100)}px`, background: today ? "#ffc23d" : d.xp ? "#4f9dff" : "var(--track)", animationDelay: `${200 + i * 50}ms` }}
              />
              <span className={`text-xs ${today ? "font-bold text-text" : "text-muted"}`}>{fmtDay.format(new Date(`${d.day}T00:00:00Z`))}</span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

const TROPHY_ICON: Record<string, string> = {
  "first-lab": "M13 2 4 14h7l-1 8 9-12h-7z",
  "no-hints": "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM3 3l18 18",
  perfectionist: "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z",
  boss: "M3 18 5 7l4.5 4L12 4l2.5 7L19 7l2 11z",
  explorer: "m16 18 6-6-6-6M8 6l-6 6 6 6",
  finisher: "M4 22V4h12l-2 4 2 4H4",
  "on-fire": "M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z",
  quester: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  chest: "M3 10h18v10H3zM3 10l2-5h14l2 5M12 13v3",
  gold: "M12 2l8 3v6c0 5.5-3.5 9-8 11-4.5-2-8-5.5-8-11V5z",
  emerald: "M6 3h12l3 6-9 12L3 9z",
};
const TROPHY_COLOR = ["#ff4f7b", "#2fd18a", "#4f9dff", "#ff7a2f", "#ffc23d"];

export function Trophy({ t, i, size = 52 }: { t: GameSummary["trophies"][number]; i: number; size?: number }) {
  return (
    <li className={`flex flex-col items-center gap-1.5 text-center ${t.earned ? "" : "opacity-60"}`}>
      <span className="grid place-items-center rounded-full shadow-[inset_0_-4px_0_rgba(0,0,0,0.18)]" style={{ width: size, height: size, background: t.earned ? TROPHY_COLOR[i % TROPHY_COLOR.length] : "var(--track)" }}>
        <svg aria-hidden="true" width={size * 0.44} height={size * 0.44} viewBox="0 0 24 24" fill="none" stroke={t.earned ? "#0e0f12" : "var(--muted)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d={TROPHY_ICON[t.id] ?? TROPHY_ICON.perfectionist} />
        </svg>
      </span>
      <span className="text-sm font-semibold leading-tight">{t.name}</span>
      <span className="text-xs leading-tight text-muted">{t.earned ? t.how : `Locked · ${t.how}`}</span>
    </li>
  );
}

export function TrophyShelf({ g, delay }: { g: GameSummary; delay?: number }) {
  const earned = g.trophies.filter((t) => t.earned).length;
  const shown = [...g.trophies].sort((a, b) => Number(b.earned) - Number(a.earned)).slice(0, 5);
  return (
    <Panel title="Trophies" aside={<Link href="/trophies" className="font-semibold text-blue-ink underline-offset-4 hover:underline">{earned} of {g.trophies.length} earned</Link>} delay={delay}>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {shown.map((t) => <Trophy key={t.id} t={t} i={g.trophies.indexOf(t)} />)}
      </ul>
    </Panel>
  );
}

export function BossCard({ c, delay }: { c: HomeCourse; delay?: number }) {
  const b = c.boss;
  return (
    <Panel delay={delay} className="bg-[color-mix(in_srgb,#ff4f7b_8%,var(--panel))]">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-pink/20 px-3 py-1 text-sm font-bold text-pink-ink">Mini-boss</span>
        {b && <span className="text-sm text-muted">Level {b.position + 1}{b.attempts ? ` · ${b.attempts} ${b.attempts === 1 ? "try" : "tries"} so far` : ""}</span>}
      </div>
      {b ? (
        <>
          <h2 className="font-display text-2xl font-extrabold leading-tight">{b.title}</h2>
          <p className="text-sm text-muted">Worth 1.5× XP. Clear it with no hints on the first check for 150 XP.</p>
          {b.unlocked ? (
            <Link href={`/course/${c.id}/m/${b.position + 1}`} className="flex h-12 w-fit items-center rounded-2xl bg-pink px-6 font-bold text-[#2a0612] shadow-[0_4px_0_#c22c55] transition-transform hover:-translate-y-px active:translate-y-0.5">
              Fight it
            </Link>
          ) : (
            <p className="text-sm font-semibold">Opens when you reach level {b.position + 1}.</p>
          )}
        </>
      ) : (
        <p className="text-muted">Every boss in {c.title} is beaten. Start another course for new ones.</p>
      )}
    </Panel>
  );
}

export function CourseStrip({ c, delay }: { c: HomeCourse; delay?: number }) {
  const stars = c.modules.reduce((s, m) => s + m.stars, 0);
  return (
    <Panel title={c.title} aside={<Link href={`/course/${c.id}`} className="font-semibold text-blue-ink underline-offset-4 hover:underline">{stars} of {c.modules.length * 3} stars · world map</Link>} delay={delay}>
      <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="Levels">
        {c.modules.map((m) => {
          const now = c.next?.position === m.position;
          const tone = m.done ? "bg-green text-[#06281a] shadow-[inset_0_-4px_0_#1a9a62]" : now ? "kl-now bg-blue text-white shadow-[inset_0_-4px_0_#2f6fc2]" : "border-2 border-track bg-panel-2 text-muted";
          const inner = (
            <>
              <span className={`grid h-11 w-11 place-items-center rounded-2xl font-display font-extrabold ${tone}`}>{m.position + 1}</span>
              <span className="flex gap-0.5" aria-label={`${m.stars} of 3 stars`}>
                {[0, 1, 2].map((k) => <span key={k} className={`h-1.5 w-2.5 rounded-full ${k < m.stars ? "bg-gold" : "bg-track"}`} />)}
              </span>
            </>
          );
          return (
            <li key={m.position} className="shrink-0">
              {m.unlocked ? (
                <Link href={`/course/${c.id}/m/${m.position + 1}`} aria-label={`Level ${m.position + 1}: ${m.title}`} className="flex min-w-11 flex-col items-center gap-1.5 transition-transform hover:-translate-y-0.5">{inner}</Link>
              ) : (
                <span aria-label={`Level ${m.position + 1}, locked`} className="flex min-w-11 flex-col items-center gap-1.5">{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
      {c.next && <p className="text-sm text-muted">Next up: <span className="font-semibold text-text">level {c.next.position + 1}, {c.next.title}</span></p>}
    </Panel>
  );
}
