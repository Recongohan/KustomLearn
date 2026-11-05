"use server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { inngest } from "@/inngest/client";
import { progressOf, type Progress } from "@/lib/generation";
import { currentUserId, getAiCredentials, getApiKey } from "@/lib/settings";
import { estimate } from "@/lib/estimate";
import type { Variation } from "@/lib/ai/intake";

const Id = z.string().uuid();

export async function getProgress(courseId: string): Promise<Progress | null> {
  const id = Id.safeParse(courseId);
  return id.success ? progressOf(id.data, currentUserId()) : null;
}

/** Starts or resumes generation. `raiseCap` is the learner's explicit OK to spend 30% more after a pause. */
export async function startGeneration(courseId: string, raiseCap: boolean = false): Promise<{ ok: boolean; message?: string }> {
  const id = Id.safeParse(courseId);
  if (!id.success) return { ok: false, message: "Unknown course." };
  if (typeof raiseCap !== "boolean") return { ok: false, message: "Unknown request." }; // "false" as a string would be truthy
  const userId = currentUserId();
  if (!(await getApiKey(userId)) && process.env.KL_FAKE_AI !== "1") return { ok: false, message: "Add your Anthropic key in Settings first." };

  const db = await getDb();
  const [course] = await db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.id, id.data), eq(schema.courses.userId, userId), inArray(schema.courses.status, ["draft", "partial", "failed"])));
  if (!course) return { ok: false, message: "This course is already building or finished." };

  // Courses from before token caps existed have none: use the same estimate the course page shows.
  const cap = course.budgetCapTokens ?? estimate(course.variation as Variation, (await getAiCredentials(userId)).model).capTokens;
  // Claim the course in one update, so two tabs can't both start (or both roll back) the same run.
  const startable = and(eq(schema.courses.id, course.id), eq(schema.courses.userId, userId), inArray(schema.courses.status, ["draft", "partial", "failed"]));
  const [claimed] = await db
    .update(schema.courses)
    .set({ status: "generating", statusNote: null, budgetCapTokens: raiseCap ? Math.round(Math.max(cap, course.spentTokens) * 1.3) : cap })
    .where(startable)
    .returning({ id: schema.courses.id });
  if (!claimed) return { ok: false, message: "This course is already building or finished." };
  try {
    await inngest.send({ name: "course/generate", data: { courseId: course.id } });
  } catch {
    await db
      .update(schema.courses)
      .set({ status: course.status, statusNote: course.statusNote, budgetCapTokens: course.budgetCapTokens })
      .where(and(eq(schema.courses.id, course.id), eq(schema.courses.status, "generating")));
    return { ok: false, message: "The job runner isn't reachable. Start the app with `npm run dev` or `docker compose up`." };
  }
  return { ok: true };
}
