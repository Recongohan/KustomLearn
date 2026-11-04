"use server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { inngest } from "@/inngest/client";
import { progressOf, type Progress } from "@/lib/generation";
import { currentUserId, getApiKey } from "@/lib/settings";

const Id = z.string().uuid();

export async function getProgress(courseId: string): Promise<Progress | null> {
  const id = Id.safeParse(courseId);
  return id.success ? progressOf(id.data, currentUserId()) : null;
}

/** Starts or resumes generation. `raiseCap` is the learner's explicit OK to spend 30% more after a pause. */
export async function startGeneration(courseId: string, raiseCap = false): Promise<{ ok: boolean; message?: string }> {
  const id = Id.safeParse(courseId);
  if (!id.success) return { ok: false, message: "Unknown course." };
  const userId = currentUserId();
  if (!(await getApiKey(userId)) && process.env.KL_FAKE_AI !== "1") return { ok: false, message: "Add your Anthropic key in Settings first." };

  const db = await getDb();
  const [course] = await db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.id, id.data), eq(schema.courses.userId, userId), inArray(schema.courses.status, ["draft", "partial", "failed"])));
  if (!course) return { ok: false, message: "This course is already building or finished." };

  const cap = course.budgetCapTokens ?? 0;
  await db
    .update(schema.courses)
    .set({ status: "generating", statusNote: null, budgetCapTokens: raiseCap ? Math.round(Math.max(cap, course.spentTokens) * 1.3) : cap })
    .where(eq(schema.courses.id, course.id));
  try {
    await inngest.send({ name: "course/generate", data: { courseId: course.id } });
  } catch {
    await db.update(schema.courses).set({ status: course.status, statusNote: course.statusNote }).where(eq(schema.courses.id, course.id));
    return { ok: false, message: "The job runner isn't reachable. Start the app with `npm run dev` or `docker compose up`." };
  }
  return { ok: true };
}
