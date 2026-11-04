import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb, schema } from "@/db";
import type { Variation } from "@/lib/ai/intake";
import { estimate, formatTokens } from "@/lib/estimate";
import { currentUserId } from "@/lib/settings";

async function Course({ id }: { id: Promise<string> }) {
  await connection();
  const db = await getDb();
  const [course] = await db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.id, await id), eq(schema.courses.userId, currentUserId())));
  if (!course) notFound();
  const v = course.variation as Variation;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="w-fit rounded-full bg-panel-2 px-3 py-1 text-sm font-semibold text-blue-ink">{course.category}</span>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">{course.title}</h1>
        <p className="text-lg text-muted">{course.intent}</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Timeline", `${v.weeks} weeks · ${v.hoursPerWeek} h/week`],
          ["Modules", String(v.modules)],
          ["Labs", `${v.labs.code} code · ${v.labs.terminal} terminal · ${v.labs.logs} logs`],
          ["Token budget", `${formatTokens(estimate(v, "claude-opus-5-5").capTokens)} max`], // tokens don't depend on the model
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-panel p-4">
            <p className="text-sm text-muted">{label}</p>
            <p className="font-display text-lg font-extrabold">{value}</p>
          </div>
        ))}
      </section>
      <p className="rounded-2xl bg-panel-2 p-4 text-muted">Plan locked in. Building the course comes in the next milestone.</p>
    </div>
  );
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
