// The game rules, as pure functions over the learner's history. No database, no clock: callers pass "today".
// Days are the learner's local calendar days as "YYYY-MM-DD".

export const DAILY_GOAL_MIN = 30; // Pip is full at this many minutes

// ---- days

const toDate = (day: string) => new Date(day + "T00:00:00Z");
export const addDays = (day: string, n: number) => new Date(toDate(day).getTime() + n * 86_400_000).toISOString().slice(0, 10);
export const weekday = (day: string) => (toDate(day).getUTCDay() + 6) % 7; // 0 = Monday
export const weekStart = (day: string) => addDays(day, -weekday(day));

/** Today in the learner's time zone; an unknown zone falls back to UTC. */
export function localDay(now: Date, tz: string | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

// ---- XP and levels

/** Total XP an item is worth at a star count. Gains are paid as the difference, so improving a result pays the rest. */
export function itemXp(kind: "quiz" | "lab", stars: number, boss = false): number {
  const table = kind === "quiz" ? [0, 30, 40, 50] : [0, 60, 80, 100];
  return Math.round(table[Math.max(0, Math.min(3, stars))] * (boss ? 1.5 : 1));
}

const LEVEL_NAMES = [
  "Fresh install", "Hello, world", "Tab completer", "Bug spotter", "Script tinkerer", "Log reader", "Pipe fitter",
  "Shell wrangler", "Stack tracer", "Packet sniffer", "Root seeker", "Config whisperer", "Daemon tamer", "Kernel poker",
  "Incident hunter", "System sage", "Architect", "Grandmaster", "Legend", "Mythic",
];
/** Total XP needed to reach a level: 0, 100, 300, 600, 1000, … (each level asks for 100 more than the last). */
export const xpToReach = (level: number) => 50 * level * (level - 1);

export function levelOf(xp: number) {
  let level = 1;
  while (xpToReach(level + 1) <= xp) level++;
  const from = xpToReach(level), to = xpToReach(level + 1);
  return { level, name: LEVEL_NAMES[Math.min(level, LEVEL_NAMES.length) - 1], next: LEVEL_NAMES[Math.min(level + 1, LEVEL_NAMES.length) - 1], from, to, into: xp - from, need: to - xp };
}

// ---- streaks, freezes and ranks

export const RANKS = [
  { name: "Iron", from: 0, reward: "Your first profile frame" },
  { name: "Bronze", from: 3, reward: "Bit joins your buddies" },
  { name: "Silver", from: 7, reward: "A streak freeze every Monday" },
  { name: "Gold", from: 14, reward: "Hoot joins your buddies" },
  { name: "Platinum", from: 30, reward: "Nimbus joins your buddies" },
  { name: "Emerald", from: 60, reward: "Jade joins your buddies" },
] as const;
export const MAX_FREEZES = 2;
const tierFor = (streak: number) => RANKS.findLastIndex((r) => streak >= r.from);

export type DayMark = "studied" | "frozen" | "missed" | "today" | "future";
export type Streak = { streak: number; best: number; tier: number; bestTier: number; freezes: number; marks: Map<string, DayMark> };

/**
 * Walks every day from the first one studied to today. A studied day grows the streak and can raise the rank.
 * A missed day uses a freeze if there is one; otherwise the streak resets and the rank drops one tier.
 * Freezes: one to start, one each Monday at Silver or above, one from each weekly chest; at most two held.
 * Today never counts as missed: there is still time.
 */
export function foldStreak(active: Set<string>, chestDays: string[], today: string): Streak {
  const marks = new Map<string, DayMark>();
  const first = [...active].filter((d) => d <= today).sort()[0];
  let streak = 0, best = 0, tier = 0, bestTier = 0, freezes = 1;
  if (first) {
    for (let d = first; d <= today; d = addDays(d, 1)) {
      if (weekday(d) === 0 && tier >= 2 && d !== first) freezes = Math.min(MAX_FREEZES, freezes + 1);
      if (active.has(d)) {
        streak++;
        tier = Math.max(tier, tierFor(streak));
        marks.set(d, "studied");
      } else if (d === today) {
        marks.set(d, "today");
      } else if (freezes > 0) {
        freezes--;
        marks.set(d, "frozen");
      } else {
        streak = 0;
        tier = Math.max(0, tier - 1);
        marks.set(d, "missed");
      }
      freezes = Math.min(MAX_FREEZES, freezes + chestDays.filter((c) => c === d).length); // a chest opened today helps from tomorrow
      best = Math.max(best, streak);
      bestTier = Math.max(bestTier, tier);
    }
  }
  return { streak, best, tier, bestTier, freezes, marks };
}

// ---- quests and the weekly chest

export type DayStats = { minutes: number; quizzes: number; labs: number };
export const QUESTS = [
  { id: "study", title: `Study ${DAILY_GOAL_MIN} minutes`, xp: 25, goal: DAILY_GOAL_MIN, of: (s: DayStats) => s.minutes, unit: "min" },
  { id: "quiz", title: "Clear a quiz", xp: 25, goal: 1, of: (s: DayStats) => s.quizzes, unit: "" },
  { id: "lab", title: "Clear a lab", xp: 50, goal: 1, of: (s: DayStats) => s.labs, unit: "" },
] as const;
export const CHEST = { labs: 3, xp: 300 };

export function questsFor(stats: DayStats, claimed: Set<string>) {
  return QUESTS.map((q) => {
    const have = Math.min(q.of(stats), q.goal);
    return { id: q.id, title: q.title, xp: q.xp, have, goal: q.goal, unit: q.unit, done: have >= q.goal, claimed: claimed.has(q.id) };
  });
}

// ---- trophies

export type TrophyFacts = {
  labsPassed: number;
  labsNoHints: number;
  threeStarLevels: number;
  bossesBeaten: number;
  coursesFinished: number;
  labKinds: number; // how many of logs, code and terminal have a passed lab
  questsClaimed: number;
  chests: number;
  bestStreak: number;
  bestTier: number;
};

export const TROPHIES: { id: string; name: string; how: string; earned: (f: TrophyFacts) => boolean }[] = [
  { id: "first-lab", name: "First blood", how: "Pass your first lab", earned: (f) => f.labsPassed >= 1 },
  { id: "no-hints", name: "No hints", how: "Pass 10 labs without a hint", earned: (f) => f.labsNoHints >= 10 },
  { id: "perfectionist", name: "Perfectionist", how: "3 stars on 5 levels", earned: (f) => f.threeStarLevels >= 5 },
  { id: "boss", name: "Boss slayer", how: "Beat a mini-boss lab", earned: (f) => f.bossesBeaten >= 1 },
  { id: "explorer", name: "Explorer", how: "Pass a log, a code and a terminal lab", earned: (f) => f.labKinds >= 3 },
  { id: "finisher", name: "Finisher", how: "Clear every level of a course", earned: (f) => f.coursesFinished >= 1 },
  { id: "on-fire", name: "On fire", how: "Reach a 10-day streak", earned: (f) => f.bestStreak >= 10 },
  { id: "quester", name: "Quest hunter", how: "Claim 10 daily quests", earned: (f) => f.questsClaimed >= 10 },
  { id: "chest", name: "Treasure", how: "Open a weekly chest", earned: (f) => f.chests >= 1 },
  { id: "gold", name: "Gold standard", how: "Reach Gold rank", earned: (f) => f.bestTier >= 3 },
  { id: "emerald", name: "Emerald mind", how: "Reach Emerald rank", earned: (f) => f.bestTier >= 5 },
];

// ---- study buddies

export const BUDDIES = [
  { id: "pip", name: "Pip", how: "Your starter", tier: 0 },
  { id: "bit", name: "Bit", how: "Reach Bronze", tier: 1 },
  { id: "hoot", name: "Hoot", how: "Reach Gold", tier: 3 },
  { id: "nimbus", name: "Nimbus", how: "Reach Platinum", tier: 4 },
  { id: "jade", name: "Jade", how: "Reach Emerald", tier: 5 },
] as const;

/** Mini-bosses: the last lab of every third level and of the final level. They pay 1.5× XP. */
export const isBoss = (position: number, total: number, lab: number, labs: number) => lab === labs - 1 && ((position + 1) % 3 === 0 || position === total - 1);
