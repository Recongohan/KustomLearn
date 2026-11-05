import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ModuleContent, Outline } from "./ai/generate";
import type { Variation } from "./ai/intake";
import { gradeCode, gradeResult } from "./labs/grade";
import { replay, runChecks } from "./labs/shell";
import { isBoss, itemXp } from "./game";
import { award, recordClear } from "./gameplay";
import type { LabTest, PublicLab, ResultSet, StoredLab } from "./labs/types";

// The course player. Grading is deterministic and runs here; quiz answers never reach the browser before a submit.

export const PASS = 0.7; // share of questions right to clear a module

export type Graded = { correct: boolean[]; score: number; passed: boolean };

export function gradeQuiz(quiz: ModuleContent["quiz"], answers: number[]): Graded {
  const correct = quiz.map((q, i) => answers[i] === q.answer);
  const score = quiz.length ? correct.filter(Boolean).length / quiz.length : 1;
  return { correct, score, passed: score >= PASS };
}

/**
 * Pays XP once per star level reached, each under its own key, so it never depends on reading the old row:
 * two concurrent results can't both pay, and improving later pays only the new levels.
 */
async function awardStars(userId: string, item: string, kind: "quiz" | "lab", best: number, boss = false) {
  let xp = 0;
  for (let s = 1; s <= best; s++) xp += await award(userId, `${item}:${s}`, kind, itemXp(kind, s, boss) - itemXp(kind, s - 1, boss));
  return xp;
}

/** 3 stars: perfect on the first try. 2: passed on the first try. 1: passed later. Hints arrive with labs. */
export function starsFor(g: Graded, attempt: number): number {
  if (!g.passed) return 0;
  if (attempt > 1) return 1;
  return g.score === 1 ? 3 : 2;
}

const itemId = (position: number) => `module-${position}`;
const labItem = (position: number, lab: number) => `module-${position}-lab-${lab}`;
const SOLVE_AFTER = 3; // failed checks before the solution can be opened without using every hint
const solutionText = (lab: StoredLab) => (Array.isArray(lab.solution) ? lab.solution.join("\n") : lab.solution); // terminal: one command per line

/** 3 stars: passed on the first check with no hints. 2: at most one hint. 1: passed any other way, or after the solution. */
export function labStars(passed: boolean, attempt: number, hintsUsed: number, solutionSeen: boolean): number {
  if (!passed) return 0;
  if (solutionSeen) return 1;
  if (attempt === 1 && hintsUsed === 0) return 3;
  return hintsUsed <= 1 ? 2 : 1;
}

type ProgressValues = Partial<Omit<typeof schema.progress.$inferInsert, "userId" | "courseId" | "itemId">>;
async function saveProgress(userId: string, courseId: string, item: string, values: ProgressValues) {
  const db = await getDb();
  const set = { status: "started" as const, ...values, updatedAt: new Date() };
  await db
    .insert(schema.progress)
    .values({ userId, courseId, itemId: item, ...set })
    .onConflictDoUpdate({ target: [schema.progress.userId, schema.progress.courseId, schema.progress.itemId], set });
}

async function readyCourse(courseId: string, userId: string) {
  const db = await getDb();
  const [course] = await db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.id, courseId), eq(schema.courses.userId, userId), eq(schema.courses.status, "ready")));
  return course ? { db, course } : null;
}

export type MapModule = { position: number; title: string; summary: string; scheduledOn: string | null; stars: number; done: boolean; unlocked: boolean };

/** The world map: every module with its stars and whether it is open yet (each opens when the one before is cleared). */
export async function courseMap(courseId: string, userId: string) {
  const found = await readyCourse(courseId, userId);
  if (!found) return null;
  const { db, course } = found;
  const [mods, rows] = await Promise.all([
    db.select().from(schema.modules).where(eq(schema.modules.courseId, courseId)).orderBy(asc(schema.modules.position)),
    db.select().from(schema.progress).where(and(eq(schema.progress.courseId, courseId), eq(schema.progress.userId, userId))),
  ]);
  const byItem = new Map(rows.map((r) => [r.itemId, r]));
  const plan = course.plan as Outline;
  let open = true;
  const modules: MapModule[] = mods.map((m) => {
    // A level is cleared when its quiz and every lab are; its stars are the lowest among them.
    const labs = (m.content as ModuleContent | null)?.labs ?? [];
    const items = [byItem.get(itemId(m.position)), ...labs.map((_, k) => byItem.get(labItem(m.position, k)))];
    const done = items.every((r) => r?.status === "done");
    const stars = done ? Math.min(...items.map((r) => r!.stars)) : 0;
    const entry = { position: m.position, title: m.title, summary: plan.modules[m.position]?.summary ?? "", scheduledOn: m.scheduledOn, stars, done, unlocked: open };
    open = open && done;
    return entry;
  });
  return { title: course.title, intent: course.intent, category: course.category, variation: course.variation as Variation, modules };
}

export type PlayModule = {
  position: number;
  total: number;
  title: string;
  sections: ModuleContent["sections"];
  diagram: string;
  quiz: { question: string; choices: string[] }[];
  best: { stars: number; done: boolean };
  labs: (PublicLab & { boss: boolean; state: LabState })[];
};

export type LabState = { done: boolean; stars: number; attempts: number; hintsShown: string[]; canSolve: boolean; solution: { solution: string; walkthrough: string } | null };

/** One module to play, or null if it doesn't exist or isn't unlocked. The quiz goes out without answers. */
export async function playModule(courseId: string, userId: string, position: number): Promise<PlayModule | null> {
  const map = await courseMap(courseId, userId);
  const entry = map?.modules[position];
  if (!map || !entry?.unlocked) return null;
  const db = await getDb();
  const [mod] = await db
    .select()
    .from(schema.modules)
    .where(and(eq(schema.modules.courseId, courseId), eq(schema.modules.position, position)));
  const content = mod.content as ModuleContent;
  const rows = await db.select().from(schema.progress).where(and(eq(schema.progress.courseId, courseId), eq(schema.progress.userId, userId)));
  const byItem = new Map(rows.map((r) => [r.itemId, r]));
  const quizRow = byItem.get(itemId(position));
  return {
    position,
    total: map.modules.length,
    title: mod.title,
    sections: content.sections,
    diagram: content.diagram,
    quiz: content.quiz.map((q) => ({ question: q.question, choices: q.choices })),
    best: { stars: quizRow?.stars ?? 0, done: quizRow?.status === "done" },
    // Labs go out without their solution, hints not yet opened, or the expected rows.
    labs: (content.labs ?? []).map((lab, k) => {
      const row = byItem.get(labItem(position, k));
      const used = row?.hintsUsed ?? 0;
      const pub: PublicLab =
        lab.kind === "logs"
          ? { kind: "logs", title: lab.title, task: lab.task, setup: lab.setup, starter: lab.starter, hints: lab.hints.length }
          : lab.kind === "code"
            ? { kind: "code", title: lab.title, task: lab.task, language: lab.language, entry: lab.entry, starter: lab.starter, tests: lab.tests, hints: lab.hints.length }
            : { kind: "terminal", title: lab.title, task: lab.task, files: lab.files, checks: lab.checks.map((c) => c.name), hints: lab.hints.length }; // check texts stay server-side
      return {
        ...pub,
        boss: isBoss(position, map.modules.length, k, content.labs!.length),
        state: {
          done: row?.status === "done",
          stars: row?.stars ?? 0,
          attempts: row?.attempts ?? 0,
          hintsShown: lab.hints.slice(0, used),
          canSolve: used >= lab.hints.length || (row?.attempts ?? 0) >= SOLVE_AFTER,
          solution: row?.solutionSeen ? { solution: solutionText(lab), walkthrough: lab.walkthrough } : null,
        },
      };
    }),
  };
}

export type QuizResult = Graded & { stars: number; best: number; xp: number; explanations: string[]; answers: number[]; next: number | null; last: boolean };

/** Grades a submitted quiz and records the attempt. Stars only ever go up. */
export async function submitQuiz(courseId: string, userId: string, position: number, answers: number[]): Promise<QuizResult | null> {
  const play = await playModule(courseId, userId, position);
  if (!play || answers.length !== play.quiz.length) return null;
  const db = await getDb();
  const [mod] = await db
    .select()
    .from(schema.modules)
    .where(and(eq(schema.modules.courseId, courseId), eq(schema.modules.position, position)));
  const quiz = (mod.content as ModuleContent).quiz;
  const graded = gradeQuiz(quiz, answers);

  const id = itemId(position);
  const p = schema.progress;
  const mine = and(eq(p.userId, userId), eq(p.courseId, courseId), eq(p.itemId, id));
  // One atomic step claims this attempt's number, so two quick submits can't both count as the first try.
  const [claimed] = await db
    .insert(p)
    .values({ userId, courseId, itemId: id, status: "started", attempts: 1 })
    .onConflictDoUpdate({ target: [p.userId, p.courseId, p.itemId], set: { attempts: sql`${p.attempts} + 1`, updatedAt: new Date() } })
    .returning({ attempts: p.attempts });
  const stars = starsFor(graded, claimed.attempts);
  // Merged in the database, so a concurrent submit can never lower the best stars, the best score or a cleared level.
  const [row] = await db
    .update(p)
    .set({
      stars: sql`greatest(${p.stars}, ${stars})`,
      score: sql`greatest(coalesce(${p.score}, 0), ${Math.round(graded.score * 100)})`,
      ...(graded.passed ? { status: "done" as const } : {}),
      updatedAt: new Date(),
    })
    .where(mine)
    .returning({ stars: p.stars, status: p.status });
  const best = row.stars;
  const values = { status: row.status };

  const xp = await awardStars(userId, `quiz:${courseId}:${id}`, "quiz", best);
  if (graded.passed) await recordClear(userId, "quiz", `quiz:${courseId}:${id}`);
  return {
    ...graded,
    stars,
    best,
    xp,
    explanations: quiz.map((q) => q.explanation),
    answers: quiz.map((q) => q.answer),
    next: await nextOpen(courseId, userId, position),
    last: position + 1 >= play.total,
  };
}

/**
 * Instant feedback on one question. It records nothing: the attempt that counts is the full submit.
 * shortcut: a learner could check every answer before submitting; fine for self-study, revisit for cloud leaderboards.
 */
export async function checkAnswer(courseId: string, userId: string, position: number, question: number, choice: number) {
  const play = await playModule(courseId, userId, position);
  if (!play || !play.quiz[question]) return null;
  const db = await getDb();
  const [mod] = await db
    .select()
    .from(schema.modules)
    .where(and(eq(schema.modules.courseId, courseId), eq(schema.modules.position, position)));
  const q = (mod.content as ModuleContent).quiz[question];
  return { correct: q.answer === choice, answer: q.answer, explanation: q.explanation };
}

/** The next level, if clearing this one (quiz and labs) has opened it. */
async function nextOpen(courseId: string, userId: string, position: number): Promise<number | null> {
  const map = await courseMap(courseId, userId);
  return map?.modules[position]?.done && position + 1 < map.modules.length ? position + 1 : null;
}

async function labContext(courseId: string, userId: string, position: number, k: number) {
  const play = await playModule(courseId, userId, position); // checks ownership, readiness and that the level is open
  if (!play?.labs[k]) return null;
  const db = await getDb();
  const [mod] = await db
    .select()
    .from(schema.modules)
    .where(and(eq(schema.modules.courseId, courseId), eq(schema.modules.position, position)));
  const lab = (mod.content as ModuleContent).labs![k];
  const item = labItem(position, k);
  const [row] = await db
    .select()
    .from(schema.progress)
    .where(and(eq(schema.progress.userId, userId), eq(schema.progress.courseId, courseId), eq(schema.progress.itemId, item)));
  return { lab, row, item, labs: (mod.content as ModuleContent).labs!.length };
}

/** Opens the next hint tier and returns every hint opened so far. Each one costs stars. */
export async function labHint(courseId: string, userId: string, position: number, k: number) {
  const ctx = await labContext(courseId, userId, position, k);
  if (!ctx) return null;
  const used = Math.min((ctx.row?.hintsUsed ?? 0) + 1, ctx.lab.hints.length);
  await saveProgress(userId, courseId, ctx.item, { status: ctx.row?.status ?? "started", hintsUsed: used });
  return { hintsShown: ctx.lab.hints.slice(0, used), canSolve: used >= ctx.lab.hints.length || (ctx.row?.attempts ?? 0) >= SOLVE_AFTER };
}

/** The solution and walkthrough, once every hint is used or after a few failed checks. Caps this lab at 1 star. */
export async function labSolution(courseId: string, userId: string, position: number, k: number) {
  const ctx = await labContext(courseId, userId, position, k);
  if (!ctx) return null;
  const used = ctx.row?.hintsUsed ?? 0;
  if (used < ctx.lab.hints.length && (ctx.row?.attempts ?? 0) < SOLVE_AFTER) return null;
  await saveProgress(userId, courseId, ctx.item, { status: ctx.row?.status ?? "started", solutionSeen: 1 });
  return { solution: solutionText(ctx.lab), walkthrough: ctx.lab.walkthrough };
}

export type LabResult = { tests: LabTest[]; passed: boolean; stars: number; best: number; xp: number; boss: boolean; canSolve: boolean; next: number | null; levelDone: boolean };

/**
 * Grades what the learner's code produced in the browser (a query's rows, or a function's return values) against
 * the reference results, which never leave the server. Terminal labs send their commands and are replayed here.
 * shortcut: for log and code labs the browser reports its own results, so a determined learner could fake them;
 * fine for self-study, re-run the code server-side in the validation sandbox before any shared leaderboard.
 */
export type LabAnswer = { rows: ResultSet } | { values: (string | null)[] } | { commands: string[] };

export async function labSubmit(courseId: string, userId: string, position: number, k: number, answer: LabAnswer): Promise<LabResult | null> {
  const ctx = await labContext(courseId, userId, position, k);
  if (!ctx) return null;
  const { lab } = ctx;
  let tests: LabTest[];
  if (lab.kind === "logs" && "rows" in answer) tests = gradeResult(lab.expected, answer.rows, lab.ordered);
  else if (lab.kind === "code" && "values" in answer && answer.values.length === lab.tests.length) tests = gradeCode(lab.expected, lab.tests, answer.values);
  else if (lab.kind === "terminal" && "commands" in answer) {
    const { sh, lastOutput } = replay(lab.files, answer.commands);
    tests = runChecks(sh, lab.checks, lastOutput);
  } else return null; // an answer of the wrong shape for this lab
  const passed = tests.every((t) => t.pass);
  const attempt = (ctx.row?.attempts ?? 0) + 1;
  const stars = labStars(passed, attempt, ctx.row?.hintsUsed ?? 0, !!ctx.row?.solutionSeen);
  const best = Math.max(stars, ctx.row?.stars ?? 0);
  const done = ctx.row?.status === "done" || passed;
  await saveProgress(userId, courseId, ctx.item, { status: done ? "done" : "started", attempts: attempt, stars: best, score: passed ? 100 : (ctx.row?.score ?? 0) });
  const map = await courseMap(courseId, userId);
  const levelDone = !!map?.modules[position]?.done;
  const boss = isBoss(position, map?.modules.length ?? 1, k, ctx.labs);
  const xp = await awardStars(userId, `lab:${courseId}:${ctx.item}`, "lab", best, boss);
  if (passed) await recordClear(userId, "lab", `lab:${courseId}:${ctx.item}`);
  return {
    tests,
    passed,
    stars,
    best,
    xp,
    boss,
    canSolve: (ctx.row?.hintsUsed ?? 0) >= ctx.lab.hints.length || attempt >= SOLVE_AFTER,
    levelDone,
    next: levelDone && position + 1 < (map?.modules.length ?? 0) ? position + 1 : null,
  };
}

/**
 * The course the home screen leads with: the one last played (else the newest ready one), its next level,
 * and its next unbeaten mini-boss.
 */
export async function homeCourse(userId: string) {
  const db = await getDb();
  const [last] = await db
    .select({ id: schema.courses.id })
    .from(schema.progress)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.progress.courseId))
    .where(and(eq(schema.progress.userId, userId), eq(schema.courses.status, "ready")))
    .orderBy(desc(schema.progress.updatedAt))
    .limit(1);
  const [newest] = last ? [last] : await db.select({ id: schema.courses.id }).from(schema.courses).where(and(eq(schema.courses.userId, userId), eq(schema.courses.status, "ready"))).orderBy(desc(schema.courses.createdAt)).limit(1);
  if (!newest) return null;
  const map = await courseMap(newest.id, userId);
  if (!map) return null;
  const [mods, rows] = await Promise.all([
    db.select({ position: schema.modules.position, content: schema.modules.content }).from(schema.modules).where(eq(schema.modules.courseId, newest.id)).orderBy(asc(schema.modules.position)),
    db.select().from(schema.progress).where(and(eq(schema.progress.courseId, newest.id), eq(schema.progress.userId, userId))),
  ]);
  const byItem = new Map(rows.map((r) => [r.itemId, r]));
  let boss: { position: number; index: number; title: string; unlocked: boolean; attempts: number; scheduledOn: string | null } | null = null;
  for (const m of mods) {
    const labs = (m.content as ModuleContent | null)?.labs ?? [];
    const k = labs.length - 1;
    if (k < 0 || !isBoss(m.position, mods.length, k, labs.length)) continue;
    const row = byItem.get(labItem(m.position, k));
    if (row?.status === "done") continue;
    const entry = map.modules[m.position];
    boss = { position: m.position, index: k, title: labs[k].title, unlocked: entry.unlocked, attempts: row?.attempts ?? 0, scheduledOn: entry.scheduledOn };
    break;
  }
  return { id: newest.id, title: map.title, modules: map.modules, next: map.modules.find((m) => m.unlocked && !m.done) ?? null, boss };
}
export type HomeCourse = NonNullable<Awaited<ReturnType<typeof homeCourse>>>;
