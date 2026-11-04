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
    return (
      <div className="flex flex-col gap-6">
        <WorldMap id={courseId} title={map.title} intent={map.intent} category={map.category} capstone={map.variation.capstone} hoursPerWeek={map.variation.hoursPerWeek} modules={map.modules} today={today} />
        <section aria-labelledby="own-h" className="flex flex-col gap-3 rounded-3xl border border-line bg-panel p-5 md:flex-row md:items-center md:p-6">
          <div className="flex-1">
            <h2 id="own-h" className="font-display text-xl font-extrabold">Share it</h2>
            <p className="mt-1 text-sm text-muted">Save this course as a .kustom file. Anyone can import it and play it with their own progress, no API key needed.</p>
          </div>
          <a href={`/course/${courseId}/export`} download className="flex h-12 items-center justify-center rounded-2xl border border-line px-5 font-bold transition-transform hover:-translate-y-px active:translate-y-px">
            Download .kustom
          </a>
        </section>
      </div>
    );
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
