import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ModuleContent, Outline } from "./ai/generate";
import type { Variation } from "./ai/intake";
import { gradeResult } from "./labs/grade";
import type { LabTest, PublicLab, ResultSet } from "./labs/types";

// The course player. Grading is deterministic and runs here; quiz answers never reach the browser before a submit.

export const PASS = 0.7; // share of questions right to clear a module

export type Graded = { correct: boolean[]; score: number; passed: boolean };

export function gradeQuiz(quiz: ModuleContent["quiz"], answers: number[]): Graded {
  const correct = quiz.map((q, i) => answers[i] === q.answer);
  const score = quiz.length ? correct.filter(Boolean).length / quiz.length : 1;
  return { correct, score, passed: score >= PASS };
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
  labs: (PublicLab & { state: LabState })[];
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
      return {
        kind: lab.kind,
        title: lab.title,
        task: lab.task,
        setup: lab.setup,
        starter: lab.starter,
        hints: lab.hints.length,
        state: {
          done: row?.status === "done",
          stars: row?.stars ?? 0,
          attempts: row?.attempts ?? 0,
          hintsShown: lab.hints.slice(0, used),
          canSolve: used >= lab.hints.length || (row?.attempts ?? 0) >= SOLVE_AFTER,
          solution: row?.solutionSeen ? { solution: lab.solution, walkthrough: lab.walkthrough } : null,
        },
      };
    }),
  };
}

export type QuizResult = Graded & { stars: number; best: number; explanations: string[]; answers: number[]; next: number | null; last: boolean };

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
  const [prev] = await db
    .select()
    .from(schema.progress)
    .where(and(eq(schema.progress.userId, userId), eq(schema.progress.courseId, courseId), eq(schema.progress.itemId, id)));
  const attempt = (prev?.attempts ?? 0) + 1;
  const stars = starsFor(graded, attempt);
  const best = Math.max(stars, prev?.stars ?? 0);
  const values = {
    status: prev?.status === "done" || graded.passed ? ("done" as const) : ("started" as const),
    score: Math.round(Math.max(graded.score, (prev?.score ?? 0) / 100) * 100),
    attempts: attempt,
    stars: best,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.progress)
    .values({ userId, courseId, itemId: id, ...values })
    .onConflictDoUpdate({ target: [schema.progress.userId, schema.progress.courseId, schema.progress.itemId], set: values });

  return {
    ...graded,
    stars,
    best,
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
  return { lab, row, item };
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
  return { solution: ctx.lab.solution, walkthrough: ctx.lab.walkthrough };
}

export type LabResult = { tests: LabTest[]; passed: boolean; stars: number; best: number; canSolve: boolean; next: number | null; levelDone: boolean };

/**
 * Grades the rows the learner's query returned against the reference rows, which never leave the server.
 * shortcut: the browser runs the query and reports its rows, so a determined learner could fake them; fine for
 * self-study, re-run the query server-side in a sandbox before any shared leaderboard.
 */
export async function labSubmit(courseId: string, userId: string, position: number, k: number, result: ResultSet): Promise<LabResult | null> {
  const ctx = await labContext(courseId, userId, position, k);
  if (!ctx) return null;
  const tests = gradeResult(ctx.lab.expected, result, ctx.lab.ordered);
  const passed = tests.every((t) => t.pass);
  const attempt = (ctx.row?.attempts ?? 0) + 1;
  const stars = labStars(passed, attempt, ctx.row?.hintsUsed ?? 0, !!ctx.row?.solutionSeen);
  const best = Math.max(stars, ctx.row?.stars ?? 0);
  const done = ctx.row?.status === "done" || passed;
  await saveProgress(userId, courseId, ctx.item, { status: done ? "done" : "started", attempts: attempt, stars: best, score: passed ? 100 : (ctx.row?.score ?? 0) });
  const map = await courseMap(courseId, userId);
  const levelDone = !!map?.modules[position]?.done;
  return {
    tests,
    passed,
    stars,
    best,
    canSolve: (ctx.row?.hintsUsed ?? 0) >= ctx.lab.hints.length || attempt >= SOLVE_AFTER,
    levelDone,
    next: levelDone && position + 1 < (map?.modules.length ?? 0) ? position + 1 : null,
  };
}
