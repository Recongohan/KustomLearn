import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { progressOf } from "@/lib/generation";
import { currentUserId } from "@/lib/settings";
import { getDb, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import type { Variation } from "@/lib/ai/intake";
import { CourseLive } from "./CourseLive";
import { WorldMap } from "@/components/player/WorldMap";
import { courseMap } from "@/lib/player";
import { getSettings } from "@/lib/settings";
import { BranchForm } from "./BranchForm";

/** The course this one was branched from, if it still exists. */
async function parentOf(courseId: string) {
  const db = await getDb();
  const [c] = await db.select({ parentId: schema.courses.parentCourseId, from: schema.courses.forkedAtModule, userId: schema.courses.userId }).from(schema.courses).where(eq(schema.courses.id, courseId));
  if (!c?.parentId) return null;
  const [p] = await db.select({ id: schema.courses.id, title: schema.courses.title }).from(schema.courses).where(and(eq(schema.courses.id, c.parentId), eq(schema.courses.userId, c.userId)));
  return p ? { ...p, from: c.from ?? 0 } : null;
}

async function Course({ id }: { id: Promise<string> }) {
  await connection();
  const courseId = await id;
  const progress = /^[0-9a-f-]{36}$/.test(courseId) ? await progressOf(courseId, currentUserId()) : null;
  if (!progress) notFound();
  if (progress.status === "ready") {
    const [map, { model }, parent] = await Promise.all([courseMap(courseId, currentUserId()).then((m) => m!), getSettings(), parentOf(courseId)]);
    const today = new Date().toISOString().slice(0, 10);
    return (
      <div className="flex flex-col gap-6">
        {parent && (
          <p className="-mb-3 text-sm text-muted">
            A branch of <a href={`/course/${parent.id}`} className="font-semibold text-blue-ink underline underline-offset-4">{parent.title}</a> from level {parent.from + 1}
          </p>
        )}
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
        <BranchForm courseId={courseId} levels={map.modules.map((m) => ({ position: m.position, title: m.title, done: m.done }))} variation={map.variation} model={model} />
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
