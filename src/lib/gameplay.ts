import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, schema } from "@/db";
import type { ModuleContent } from "./ai/generate";
import {
  BUDDIES, CHEST, DAILY_GOAL_MIN, QUESTS, RANKS, TROPHIES, addDays, foldStreak, isBoss, levelOf, localDay, questsFor, weekStart, type TrophyFacts,
} from "./game";

export const TZ_COOKIE = "kl_tz"; // set by the browser (Intl), so days roll over at the learner's midnight

/** Today in the learner's zone. Outside a request (tests, jobs) it is today in UTC. */
export async function today(): Promise<string> {
  let tz: string | undefined;
  try {
    tz = (await cookies()).get(TZ_COOKIE)?.value;
  } catch {}
  return localDay(new Date(), tz);
}

/** Records XP once per key; a repeat (a retried request, a double click) adds nothing. Returns what was added. */
export async function award(userId: string, key: string, reason: "quiz" | "lab" | "quest" | "chest", amount: number): Promise<number> {
  if (amount <= 0) return 0;
  const db = await getDb();
  const rows = await db.insert(schema.xpEvents).values({ userId, key, reason, amount, day: await today() }).onConflictDoNothing().returning({ id: schema.xpEvents.id });
  return rows.length ? amount : 0;
}

/** Marks a passed quiz or lab for today's quests and the weekly chest, even when it pays no new XP (a re-clear). */
export async function recordClear(userId: string, reason: "quiz" | "lab", item: string) {
  const db = await getDb();
  const day = await today();
  await db.insert(schema.xpEvents).values({ userId, key: `${item}:clear:${day}`, reason, amount: 0, day }).onConflictDoNothing();
}

const BEAT_MS = 50_000; // the browser beats once a minute while a lesson is open and in view
const MAX_DAY_MIN = 600;

/** Adds one study minute, at most once per beat interval, so a stuck tab or a script can't inflate the day. */
export async function studyBeat(userId: string): Promise<number> {
  const db = await getDb();
  const day = await today();
  const [row] = await db
    .insert(schema.studyDays)
    .values({ userId, day, minutes: 1 })
    .onConflictDoUpdate({
      target: [schema.studyDays.userId, schema.studyDays.day],
      set: {
        minutes: sql`case when ${schema.studyDays.lastBeatAt} < now() - (${BEAT_MS} * interval '1 millisecond') then least(${schema.studyDays.minutes} + 1, ${MAX_DAY_MIN}) else ${schema.studyDays.minutes} end`,
        lastBeatAt: sql`case when ${schema.studyDays.lastBeatAt} < now() - (${BEAT_MS} * interval '1 millisecond') then now() else ${schema.studyDays.lastBeatAt} end`,
      },
    })
    .returning({ minutes: schema.studyDays.minutes });
  return row.minutes;
}

async function history(userId: string) {
  const db = await getDb();
  const [events, studied] = await Promise.all([
    db.select().from(schema.xpEvents).where(eq(schema.xpEvents.userId, userId)),
    db.select().from(schema.studyDays).where(eq(schema.studyDays.userId, userId)),
  ]);
  return { events, studied };
}

const labItemOf = (key: string) => key.split(":").slice(0, 3).join(":"); // "lab:<course>:<item>:<stars>" → one per lab

function dayState(h: Awaited<ReturnType<typeof history>>, day: string) {
  const on = h.events.filter((e) => e.day === day);
  const stats = { minutes: h.studied.find((s) => s.day === day)?.minutes ?? 0, quizzes: on.filter((e) => e.reason === "quiz").length, labs: on.filter((e) => e.reason === "lab").length };
  const claimed = new Set(on.filter((e) => e.key.startsWith(`quest:${day}:`)).map((e) => e.key.split(":")[2]));
  const week = weekStart(day);
  const weekLabs = new Set(h.events.filter((e) => e.reason === "lab" && e.day >= week && e.day <= day).map((e) => labItemOf(e.key))).size;
  const chest = { week, have: Math.min(weekLabs, CHEST.labs), goal: CHEST.labs, xp: CHEST.xp, claimed: h.events.some((e) => e.key === `chest:${week}`) };
  return { stats, quests: questsFor(stats, claimed), chest, week };
}

export async function claimQuest(userId: string, id: string) {
  const q = QUESTS.find((x) => x.id === id);
  if (!q) return null;
  const day = await today();
  const state = dayState(await history(userId), day).quests.find((x) => x.id === id)!;
  if (!state.done) return null;
  return { xp: await award(userId, `quest:${day}:${id}`, "quest", q.xp) };
}

export async function claimChest(userId: string) {
  const day = await today();
  const { chest, week } = dayState(await history(userId), day);
  if (chest.have < chest.goal) return null;
  return { xp: await award(userId, `chest:${week}`, "chest", CHEST.xp) }; // the freeze inside is counted from this event
}

/** Everything the home dashboard and the game screens show, computed from the two logs and the learner's progress. */
export async function gameSummary(userId: string) {
  const db = await getDb();
  const day = await today();
  const h = await history(userId);
  const xp = h.events.reduce((n, e) => n + e.amount, 0);
  // Studying is lesson time or a quiz or lab result; claiming a quest or opening the chest is not.
  const active = new Set([...h.studied.filter((s) => s.minutes > 0).map((s) => s.day), ...h.events.filter((e) => e.reason === "quiz" || e.reason === "lab").map((e) => e.day)]);
  const streak = foldStreak(active, h.events.filter((e) => e.reason === "chest").map((e) => e.day), day);
  const { stats, quests, chest } = dayState(h, day);

  const monday = weekStart(day);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return { day: d, xp: h.events.filter((e) => e.day === d).reduce((n, e) => n + e.amount, 0), mark: streak.marks.get(d) ?? (d > day ? "future" : null) };
  });
  const lastWeek = h.events.filter((e) => e.day >= addDays(monday, -7) && e.day < monday).reduce((n, e) => n + e.amount, 0);

  // Trophy facts come from progress rows plus each level's labs (their kind, and which one is the mini-boss).
  const [rows, mods] = await Promise.all([
    db.select().from(schema.progress).where(eq(schema.progress.userId, userId)),
    db
      .select({ courseId: schema.modules.courseId, position: schema.modules.position, content: schema.modules.content })
      .from(schema.modules)
      .innerJoin(schema.courses, eq(schema.courses.id, schema.modules.courseId))
      .where(and(eq(schema.courses.userId, userId), eq(schema.courses.status, "ready"))),
  ]);
  const byItem = new Map(rows.map((r) => [`${r.courseId}/${r.itemId}`, r]));
  const done = new Set(rows.filter((r) => r.status === "done").map((r) => `${r.courseId}/${r.itemId}`));
  let threeStarLevels = 0;
  const totals = new Map<string, number>();
  for (const m of mods) totals.set(m.courseId, (totals.get(m.courseId) ?? 0) + 1);
  const kinds = new Set<string>();
  let bosses = 0;
  const finished = new Map<string, boolean>();
  for (const m of mods) {
    const labs = (m.content as ModuleContent | null)?.labs ?? [];
    let all = done.has(`${m.courseId}/module-${m.position}`);
    const items = [`module-${m.position}`, ...labs.map((_, k) => `module-${m.position}-lab-${k}`)].map((i) => byItem.get(`${m.courseId}/${i}`));
    if (items.every((r) => r?.status === "done" && r.stars === 3)) threeStarLevels++; // a level's stars are its lowest item's, as on the map
    labs.forEach((lab, k) => {
      const ok = done.has(`${m.courseId}/module-${m.position}-lab-${k}`);
      all &&= ok;
      if (!ok) return;
      kinds.add(lab.kind);
      if (isBoss(m.position, totals.get(m.courseId)!, k, labs.length)) bosses++;
    });
    finished.set(m.courseId, (finished.get(m.courseId) ?? true) && all);
  }
  const labRows = rows.filter((r) => r.status === "done" && r.itemId.includes("-lab-"));
  const facts: TrophyFacts = {
    labsPassed: labRows.length,
    labsNoHints: labRows.filter((r) => r.hintsUsed === 0 && !r.solutionSeen).length,
    threeStarLevels,
    bossesBeaten: bosses,
    coursesFinished: [...finished.values()].filter(Boolean).length,
    labKinds: kinds.size,
    questsClaimed: h.events.filter((e) => e.reason === "quest").length,
    chests: h.events.filter((e) => e.reason === "chest").length,
    bestStreak: streak.best,
    bestTier: streak.bestTier,
  };

  const next = RANKS[streak.tier + 1];
  return {
    day,
    xp,
    level: levelOf(xp),
    streak: { days: streak.streak, best: streak.best, freezes: streak.freezes, studiedToday: streak.marks.get(day) === "studied" },
    rank: { tier: streak.tier, name: RANKS[streak.tier].name, next: next ? { name: next.name, in: Math.max(1, next.from - streak.streak) } : null },
    ranks: RANKS.map((r, i) => ({ ...r, state: i < streak.tier ? "earned" : i === streak.tier ? "current" : i <= streak.bestTier ? "earned" : "locked" })),
    goal: { minutes: stats.minutes, of: DAILY_GOAL_MIN },
    quests,
    chest,
    week,
    lastWeek,
    trophies: TROPHIES.map((t) => ({ id: t.id, name: t.name, how: t.how, earned: t.earned(facts) })),
    buddies: BUDDIES.map((b) => ({ ...b, have: streak.bestTier >= b.tier })),
  };
}
export type GameSummary = Awaited<ReturnType<typeof gameSummary>>;

