import Link from "next/link";
import { Suspense } from "react";
import { Pip } from "@/components/Pip";
import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUserId, getSettings } from "@/lib/settings";
import { gameSummary } from "@/lib/gameplay";
import { homeCourse } from "@/lib/player";
import { Quests } from "@/components/game/Quests";
import { BossCard, CourseStrip, GoalCard, LevelCard, Panel, RankChip, StreakCard, TrophyShelf, WeekChart } from "@/components/game/parts";

const STATUS: Record<string, string> = { draft: "Not built yet", generating: "Building", partial: "Paused", failed: "Stopped", ready: "Ready to play" };

async function Courses() {
  await connection();
  const db = await getDb();
  const rows = await db
    .select({ id: schema.courses.id, title: schema.courses.title, category: schema.courses.category, status: schema.courses.status })
    .from(schema.courses)
    .where(eq(schema.courses.userId, currentUserId()))
    .orderBy(desc(schema.courses.createdAt));
  if (!rows.length) return null;
  return (
    <section aria-labelledby="courses-h" className="w-full">
      <h2 id="courses-h" className="font-display text-2xl font-extrabold">Your courses</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((c) => (
          <li key={c.id}>
            <Link href={`/course/${c.id}`} className="flex min-h-16 items-center gap-4 rounded-2xl border border-line bg-panel px-4 py-3 transition-transform hover:-translate-y-px active:translate-y-px">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.title}</span>
                <span className="block text-sm text-muted">{c.category}</span>
              </span>
              <span className={`shrink-0 text-sm font-semibold ${c.status === "ready" ? "text-green-ink" : c.status === "failed" ? "text-pink-ink" : "text-muted"}`}>{STATUS[c.status]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function KeyStatus() {
  const { hasKey } = await getSettings();
  if (!hasKey)
    return (
      <Link href="/settings" className="inline-flex h-13 w-fit items-center gap-2 rounded-2xl bg-green px-5 text-base font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] transition-transform hover:-translate-y-px active:translate-y-px">
        Connect your Anthropic key
      </Link>
    );
  return (
    <Link href="/new" className="inline-flex h-13 w-fit items-center gap-2 rounded-2xl bg-green px-5 text-base font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] transition-transform hover:-translate-y-px active:translate-y-px">
      Start a course
    </Link>
  );
}

function Welcome() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-start gap-6 py-6 md:py-16">
      <Pip size={96} />
      <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">What do you want to learn?</h1>
      <p className="max-w-xl text-lg text-muted">
        Describe it in your own words. KustomLearn builds a course just for you, with labs, quests, streaks and ranks, then runs it right here on your machine.
      </p>
      <Suspense fallback={<div className="h-13 w-64 animate-pulse rounded-2xl bg-panel-2" />}>
        <KeyStatus />
      </Suspense>
      <Suspense fallback={null}>
        <Courses />
      </Suspense>
    </div>
  );
}

const fmtDate = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Once there is something to play, home is the game dashboard; before that, the welcome. */
async function Home() {
  await connection();
  const userId = currentUserId();
  const [g, c] = await Promise.all([gameSummary(userId), homeCourse(userId)]);
  if (!c && g.xp === 0) return <Welcome />;
  const left = g.quests.filter((q) => !q.claimed).length;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="kl-in flex flex-col gap-4 sm:flex-row sm:items-center">
        <Pip size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-extrabold leading-[1.05] tracking-tight md:text-4xl">
            {g.streak.days > 1 ? `Day ${g.streak.days} of your streak.` : g.streak.studiedToday ? "You showed up today." : "Ready when you are."}
          </h1>
          <p className="mt-1.5 text-muted">
            {fmtDate.format(new Date(`${g.day}T00:00:00Z`))}
            {c ? ` · ${c.title}` : ""}
            {left ? ` · ${left} ${left === 1 ? "quest" : "quests"} left today` : " · every quest claimed today"}
          </p>
        </div>
        {c?.next && (
          <Link href={`/course/${c.id}/m/${c.next.position + 1}`} className="flex h-13 shrink-0 items-center justify-center gap-2 rounded-2xl bg-green px-5 font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] transition-transform hover:-translate-y-px active:translate-y-0.5">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
            Continue level {c.next.position + 1}
          </Link>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <StreakCard g={g} delay={60} />
        <LevelCard g={g} delay={120} />
        <div className="flex flex-col gap-5">
          <GoalCard g={g} delay={180} />
          <RankChip g={g} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Today's quests" aside={<Link href="/quests" className="font-semibold text-blue-ink underline-offset-4 hover:underline">Weekly chest {g.chest.have}/{g.chest.goal}</Link>} delay={240}>
          <Quests quests={g.quests} chest={g.chest} />
        </Panel>
        {c ? <BossCard c={c} delay={300} /> : <Panel title="Mini-bosses" delay={300}><p className="text-muted">Bosses appear once a course is ready.</p></Panel>}
      </div>

      {c && <CourseStrip c={c} delay={360} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <WeekChart g={g} delay={420} />
        <TrophyShelf g={g} delay={480} />
      </div>

      <Suspense fallback={null}>
        <Courses />
      </Suspense>
      <Suspense fallback={null}>
        <KeyStatus />
      </Suspense>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-6xl animate-pulse rounded-3xl bg-panel" />}>
      <Home />
    </Suspense>
  );
}
