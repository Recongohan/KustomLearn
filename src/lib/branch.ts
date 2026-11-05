import "server-only";
import { and, asc, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Outline } from "./ai/generate";
import type { PricedModel } from "./ai/pricing";
import { branchEstimate } from "./estimate";
import type { Branched } from "./generation";

export const MAX_INSTRUCTION = 500;

/**
 * A new course that keeps levels before `from` (their content and the learner's progress on them) and is
 * written anew from there, following `instruction`. It starts as a draft; generation is started separately.
 */
export async function createBranch(parentId: string, userId: string, from: number, instruction: string, model: PricedModel): Promise<string | null> {
  const db = await getDb();
  const [parent] = await db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.id, parentId), eq(schema.courses.userId, userId), eq(schema.courses.status, "ready")));
  if (!parent) return null;
  const v = parent.variation as Branched;
  const plan = parent.plan as Outline;
  if (!Number.isInteger(from) || from < 0 || from >= plan.modules.length) return null;

  return db.transaction(async (tx) => {
    const [c] = await tx
      .insert(schema.courses)
      .values({
        userId,
        title: parent.title,
        request: parent.request,
        intent: parent.intent,
        category: parent.category,
        variation: { ...v, branch: { from, instruction, keep: plan.modules.slice(0, from) } },
        status: "draft",
        budgetCapTokens: branchEstimate(v, from, model).capTokens,
        parentCourseId: parent.id,
        forkedAtModule: from,
      })
      .returning({ id: schema.courses.id });
    const kept = await tx.select().from(schema.modules).where(and(eq(schema.modules.courseId, parentId), lt(schema.modules.position, from))).orderBy(asc(schema.modules.position));
    if (kept.length) await tx.insert(schema.modules).values(kept.map((m) => ({ courseId: c.id, position: m.position, title: m.title, content: m.content })));
    // Progress on the kept levels comes along, so the branch opens where the learner was.
    const keepItem = (item: string) => Number(/^module-(\d+)/.exec(item)?.[1] ?? -1) < from && /^module-\d+/.test(item);
    const rows = (await tx.select().from(schema.progress).where(and(eq(schema.progress.courseId, parentId), eq(schema.progress.userId, userId)))).filter((r) => keepItem(r.itemId));
    if (rows.length) await tx.insert(schema.progress).values(rows.map((r) => ({ ...r, courseId: c.id })));
    return c.id;
  });
}
