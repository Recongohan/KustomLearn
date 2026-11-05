import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ModuleContent, Outline } from "./ai/generate";
import type { Variation } from "./ai/intake";

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
    const row = byItem.get(itemId(m.position));
    const done = row?.status === "done";
    const entry = { position: m.position, title: m.title, summary: plan.modules[m.position]?.summary ?? "", scheduledOn: m.scheduledOn, stars: row?.stars ?? 0, done, unlocked: open };
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
};

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
  return {
    position,
    total: map.modules.length,
    title: mod.title,
    sections: content.sections,
    diagram: content.diagram,
    quiz: content.quiz.map((q) => ({ question: q.question, choices: q.choices })),
    best: { stars: entry.stars, done: entry.done },
  };
}

export type QuizResult = Graded & { stars: number; best: number; explanations: string[]; answers: number[]; next: number | null };

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

  return {
    ...graded,
    stars,
    best,
    explanations: quiz.map((q) => q.explanation),
    answers: quiz.map((q) => q.answer),
    next: values.status === "done" && position + 1 < play.total ? position + 1 : null,
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
