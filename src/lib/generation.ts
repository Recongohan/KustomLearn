import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { GenerationError, STEP_MAX_OUTPUT, generateModule, generateOutline, type CourseBrief, type Outline, type Usage } from "./ai/generate";
import { IN_PER_CALL } from "./estimate";
import type { Variation } from "./ai/intake";
import { writerFor, type PricedModel } from "./ai/pricing";
import { getAiCredentials } from "./settings";

// Each step is idempotent: Inngest retries a failed step, so a step that already finished just returns.
export type StepResult = { paused: false; modules: number } | { paused: true; reason: string };

async function loadCourse(courseId: string) {
  const db = await getDb();
  const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
  if (!course) throw new Error(`Course ${courseId} not found`);
  return { db, course };
}

const briefOf = (c: typeof schema.courses.$inferSelect): CourseBrief => ({
  intent: c.intent,
  category: c.category,
  request: c.request,
  variation: c.variation as Variation,
});

async function credentials(userId: string) {
  const creds = await getAiCredentials(userId);
  if (!creds.apiKey && process.env.KL_FAKE_AI !== "1") throw new Error("No Anthropic key is saved.");
  return { apiKey: creds.apiKey ?? "", model: creds.model };
}

const MIN_STEP_OUTPUT = 4_000; // below this a step can't produce anything useful, so pause instead

async function pause(courseId: string): Promise<StepResult> {
  const db = await getDb();
  const reason = "Paused at your token cap. Approve a bit more to finish.";
  await db.update(schema.courses).set({ status: "partial", statusNote: reason }).where(eq(schema.courses.id, courseId));
  return { paused: true, reason };
}

/** Output tokens the next call may use so spending stays under the cap, or null when it can't fit. */
function roomLeft(course: typeof schema.courses.$inferSelect): number | null {
  if (course.budgetCapTokens == null) return Infinity;
  const room = course.budgetCapTokens - course.spentTokens - IN_PER_CALL;
  return room >= MIN_STEP_OUTPUT ? room : null;
}

/**
 * Charges a failed call for what it used, then rethrows so Inngest retries the step.
 * A call cut off because the cap limited its output pauses instead: retrying can't fit either.
 */
async function chargeFailure(err: unknown, course: typeof schema.courses.$inferSelect, model: PricedModel, room: number, stepMax: number, reason: string): Promise<StepResult> {
  if (!(err instanceof GenerationError) || !err.usage) throw err;
  const usage = err.usage;
  const db = await getDb();
  await db.transaction((tx) => charge(tx, course.id, course.userId, model, usage, `${reason} (incomplete)`));
  if (err.truncated && room < stepMax) return pause(course.id);
  throw err;
}

type Tx = Parameters<Parameters<Awaited<ReturnType<typeof getDb>>["transaction"]>[0]>[0];

// Runs in the same transaction as the content write, so a retried step can't skip its charge.
async function charge(tx: Tx, courseId: string, userId: string, model: PricedModel, usage: Usage, reason: string) {
  const tokens = usage.inputTokens + usage.outputTokens;
  await tx
    .update(schema.courses)
    .set({ spentTokens: sql`${schema.courses.spentTokens} + ${tokens}`, spentMicros: sql`${schema.courses.spentMicros} + ${usage.costMicros}` })
    .where(eq(schema.courses.id, courseId));
  await tx.insert(schema.aiCalls).values({ userId, courseId, reason, model, ...usage });
}

export async function runOutline(courseId: string): Promise<StepResult> {
  const { db, course } = await loadCourse(courseId);
  if (course.plan) return { paused: false, modules: (course.plan as Outline).modules.length };
  const room = roomLeft(course);
  if (room == null) return pause(courseId);

  const { apiKey, model } = await credentials(course.userId);
  const reason = "Build the course outline";
  let result;
  try {
    result = await generateOutline(briefOf(course), { apiKey, model, maxTokens: room });
  } catch (err) {
    return chargeFailure(err, course, model, room, STEP_MAX_OUTPUT.outline, reason);
  }
  const { data, usage } = result;
  await db.transaction(async (tx) => {
    await tx.insert(schema.modules).values(data.modules.map((m, i) => ({ courseId, position: i, title: m.title })));
    await tx.update(schema.courses).set({ plan: data, title: data.title }).where(eq(schema.courses.id, courseId));
    await charge(tx, courseId, course.userId, model, usage, reason);
  });
  return { paused: false, modules: data.modules.length };
}

export async function runModule(courseId: string, position: number): Promise<StepResult> {
  const { db, course } = await loadCourse(courseId);
  const plan = course.plan as Outline;
  const [mod] = await db
    .select()
    .from(schema.modules)
    .where(and(eq(schema.modules.courseId, courseId), eq(schema.modules.position, position)));
  if (mod.content) return { paused: false, modules: plan.modules.length };
  const room = roomLeft(course);
  if (room == null) return pause(courseId);

  const { apiKey, model: chosen } = await credentials(course.userId);
  const model = writerFor(chosen);
  const reason = `Write module ${position + 1}: ${mod.title}`;
  let result;
  try {
    result = await generateModule(briefOf(course), plan, position, { apiKey, model, maxTokens: room });
  } catch (err) {
    return chargeFailure(err, course, model, room, STEP_MAX_OUTPUT.module, reason);
  }
  const { data, usage } = result;
  await db.transaction(async (tx) => {
    await tx.update(schema.modules).set({ content: data }).where(eq(schema.modules.id, mod.id));
    await charge(tx, courseId, course.userId, model, usage, reason);
  });
  return { paused: false, modules: plan.modules.length };
}

export async function finalize(courseId: string) {
  const db = await getDb();
  const missing = await db
    .select({ id: schema.modules.id })
    .from(schema.modules)
    .where(and(eq(schema.modules.courseId, courseId), isNull(schema.modules.content)));
  if (missing.length) throw new Error(`${missing.length} modules have no content`);
  await db.update(schema.courses).set({ status: "ready", statusNote: null }).where(eq(schema.courses.id, courseId));
}

export async function markFailed(courseId: string, note: string) {
  const db = await getDb();
  await db.update(schema.courses).set({ status: "failed", statusNote: note }).where(eq(schema.courses.id, courseId));
}

/** What the course page polls while generating. */
export async function progressOf(courseId: string, userId: string) {
  const db = await getDb();
  const [course] = await db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.id, courseId), eq(schema.courses.userId, userId)));
  if (!course) return null;
  const mods = await db
    .select({ position: schema.modules.position, title: schema.modules.title, done: sql<boolean>`${schema.modules.content} is not null` })
    .from(schema.modules)
    .where(eq(schema.modules.courseId, courseId))
    .orderBy(asc(schema.modules.position));
  return {
    status: course.status,
    statusNote: course.statusNote,
    title: course.title,
    spentTokens: course.spentTokens,
    capTokens: course.budgetCapTokens ?? 0,
    totalModules: (course.variation as Variation).modules,
    modules: mods,
  };
}
export type Progress = NonNullable<Awaited<ReturnType<typeof progressOf>>>;
