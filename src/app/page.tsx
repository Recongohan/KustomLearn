import Link from "next/link";
import { Suspense } from "react";
import { Pip } from "@/components/Pip";
import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUserId, getSettings } from "@/lib/settings";

const STATUS: Record<string, string> = { draft: "Not built yet", generating: "Building", partial: "Paused", failed: "Stopped", ready: "Ready to play" };

async function Courses() {
  await connection();
  const db = await getDb();
  const rows = await db
    .select({ id: schema.courses.id, title: schema.courses.title, category: schema.courses.category, status: schema.courses.status })
    .from(schema.courses)
    .where(eq(schema.courses.userId, currentUserId()))
    .orderBy(desc(schema.courses.createdAt));
  if (!rows.length) return null;
  return (
    <section aria-labelledby="courses-h" className="w-full">
      <h2 id="courses-h" className="font-display text-2xl font-extrabold">Your courses</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((c) => (
          <li key={c.id}>
            <Link href={`/course/${c.id}`} className="flex min-h-16 items-center gap-4 rounded-2xl border border-line bg-panel px-4 py-3 transition-transform hover:-translate-y-px active:translate-y-px">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.title}</span>
                <span className="block text-sm text-muted">{c.category}</span>
              </span>
              <span className={`shrink-0 text-sm font-semibold ${c.status === "ready" ? "text-green-ink" : c.status === "failed" ? "text-pink-ink" : "text-muted"}`}>{STATUS[c.status]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function KeyStatus() {
  const { hasKey } = await getSettings();
  if (!hasKey)
    return (
      <Link href="/settings" className="inline-flex h-13 items-center gap-2 rounded-2xl bg-green px-5 text-base font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] transition-transform hover:-translate-y-px active:translate-y-px">
        Connect your Anthropic key
      </Link>
    );
  return (
    <Link href="/new" className="inline-flex h-13 items-center gap-2 rounded-2xl bg-green px-5 text-base font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] transition-transform hover:-translate-y-px active:translate-y-px">
      Start a course
    </Link>
  );
}

export default function Home() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-start gap-6 py-6 md:py-16">
      <Pip size={96} />
      <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">What do you want to learn?</h1>
      <p className="max-w-xl text-lg text-muted">
        Describe it in your own words. KustomLearn builds a course just for you, with labs, quests, streaks and ranks, then runs it right here on your machine.
      </p>
      <Suspense fallback={<div className="h-13 w-64 animate-pulse rounded-2xl bg-panel-2" />}>
        <KeyStatus />
      </Suspense>
      <Suspense fallback={null}>
        <Courses />
      </Suspense>
    </div>
  );
}
