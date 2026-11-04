import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { generateModule, generateOutline, type CourseBrief, type Outline, type Usage } from "./ai/generate";
import type { Variation } from "./ai/intake";
import { costMicros } from "./ai/pricing";
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

/** Pauses (without spending) once the approved token cap is used up. */
async function overCap(courseId: string): Promise<StepResult | null> {
  const { db, course } = await loadCourse(courseId);
  if (course.budgetCapTokens == null || course.spentTokens < course.budgetCapTokens) return null;
  const reason = "Paused at your token cap. Approve a bit more to finish.";
  await db.update(schema.courses).set({ status: "partial", statusNote: reason }).where(eq(schema.courses.id, courseId));
  return { paused: true, reason };
}

async function charge(courseId: string, userId: string, model: Parameters<typeof costMicros>[0], usage: Usage, reason: string) {
  const db = await getDb();
  const tokens = usage.inputTokens + usage.outputTokens;
  const cost = costMicros(model, usage.inputTokens, usage.outputTokens);
  await db
    .update(schema.courses)
    .set({ spentTokens: sql`${schema.courses.spentTokens} + ${tokens}`, spentMicros: sql`${schema.courses.spentMicros} + ${cost}` })
    .where(eq(schema.courses.id, courseId));
  await db.insert(schema.aiCalls).values({ userId, courseId, reason, model, ...usage, costMicros: cost });
}

export async function runOutline(courseId: string): Promise<StepResult> {
  const { db, course } = await loadCourse(courseId);
  if (course.plan) return { paused: false, modules: (course.plan as Outline).modules.length };
  const capped = await overCap(courseId);
  if (capped) return capped;

  const { apiKey, model } = await credentials(course.userId);
  const { data, usage } = await generateOutline(briefOf(course), { apiKey, model });
  await db.transaction(async (tx) => {
    await tx.insert(schema.modules).values(data.modules.map((m, i) => ({ courseId, position: i, title: m.title })));
    await tx.update(schema.courses).set({ plan: data, title: data.title }).where(eq(schema.courses.id, courseId));
  });
  await charge(courseId, course.userId, model, usage, "Build the course outline");
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
  const capped = await overCap(courseId);
  if (capped) return capped;

  const { apiKey, model } = await credentials(course.userId);
  const { data, usage } = await generateModule(briefOf(course), plan, position, { apiKey, model });
  await db.update(schema.modules).set({ content: data }).where(eq(schema.modules.id, mod.id));
  await charge(courseId, course.userId, model, usage, `Write module ${position + 1}: ${mod.title}`);
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
