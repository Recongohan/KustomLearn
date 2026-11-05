import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { progressOf } from "@/lib/generation";
import { currentUserId } from "@/lib/settings";
import { getDb, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import type { Variation } from "@/lib/ai/intake";
import { CourseLive } from "./CourseLive";

async function Course({ id }: { id: Promise<string> }) {
  await connection();
  const courseId = await id;
  const userId = currentUserId();
  const progress = /^[0-9a-f-]{36}$/.test(courseId) ? await progressOf(courseId, userId) : null;
  if (!progress) notFound();
  const db = await getDb();
  const [course] = await db.select().from(schema.courses).where(and(eq(schema.courses.id, courseId), eq(schema.courses.userId, userId)));
  if (!course) notFound();
  return <CourseLive id={courseId} intent={course.intent} category={course.category} variation={course.variation as Variation} initial={progress} />;
}

export default function CoursePage({ params }: PageProps<"/course/[id]">) {
  return (
    <div className="mx-auto max-w-4xl">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-panel" />}>
        <Course id={params.then((p) => p.id)} />
      </Suspense>
    </div>
  );
}
