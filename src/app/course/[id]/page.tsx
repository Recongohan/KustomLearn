import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { progressOf } from "@/lib/generation";
import { currentUserId } from "@/lib/settings";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import type { Variation } from "@/lib/ai/intake";
import { CourseLive } from "./CourseLive";
import { WorldMap } from "@/components/player/WorldMap";
import { courseMap } from "@/lib/player";

async function Course({ id }: { id: Promise<string> }) {
  await connection();
  const courseId = await id;
  const progress = /^[0-9a-f-]{36}$/.test(courseId) ? await progressOf(courseId, currentUserId()) : null;
  if (!progress) notFound();
  if (progress.status === "ready") {
    const map = (await courseMap(courseId, currentUserId()))!;
    const today = new Date().toISOString().slice(0, 10);
    return <WorldMap id={courseId} title={map.title} intent={map.intent} category={map.category} capstone={map.variation.capstone} hoursPerWeek={map.variation.hoursPerWeek} modules={map.modules} today={today} />;
  }
  const db = await getDb();
  const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
  return <CourseLive id={courseId} intent={course.intent} category={course.category} variation={course.variation as Variation} initial={progress} />;
}

export default function CoursePage({ params }: PageProps<"/course/[id]">) {
  return (
    <div className="mx-auto max-w-6xl">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-panel" />}>
        <Course id={params.then((p) => p.id)} />
      </Suspense>
    </div>
  );
}
