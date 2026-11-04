import { cookies } from "next/headers";
import { connection } from "next/server";
import { and, count, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { SESSION_COOKIE, verifySession } from "@/lib/gate";
import { currentUserId } from "@/lib/settings";
import { CourseLinks, type SideCourse } from "./CourseLinks";

/** "Your courses" in the sidebar, with how far each one is. */
export async function SidebarCourses() {
  await connection();
  // The shell also wraps /login, which the gate leaves open: never list courses to someone who isn't signed in.
  const password = process.env.APP_PASSWORD;
  if (password && !verifySession((await cookies()).get(SESSION_COOKIE)?.value ?? "", password)) return null;
  let userId: string;
  try {
    userId = currentUserId();
  } catch {
    return null; // hosted mode fails closed until sign-in exists
  }

  const db = await getDb();
  const [courses, totals, cleared] = await Promise.all([
    db.select({ id: schema.courses.id, title: schema.courses.title, status: schema.courses.status }).from(schema.courses).where(eq(schema.courses.userId, userId)).orderBy(desc(schema.courses.createdAt)).limit(8),
    db.select({ courseId: schema.modules.courseId, n: count() }).from(schema.modules).innerJoin(schema.courses, eq(schema.courses.id, schema.modules.courseId)).where(eq(schema.courses.userId, userId)).groupBy(schema.modules.courseId),
    db.select({ courseId: schema.progress.courseId, n: count() }).from(schema.progress).where(and(eq(schema.progress.userId, userId), eq(schema.progress.status, "done"))).groupBy(schema.progress.courseId),
  ]);
  if (!courses.length) return null;
  const total = new Map(totals.map((t) => [t.courseId, Number(t.n)]));
  const done = new Map(cleared.map((c) => [c.courseId, Number(c.n)]));
  const list: SideCourse[] = courses.map((c) => ({
    id: c.id,
    title: c.title,
    pct: c.status === "ready" && total.get(c.id) ? Math.round(((done.get(c.id) ?? 0) / total.get(c.id)!) * 100) : null,
  }));
  return <CourseLinks courses={list} />;
}
