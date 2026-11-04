"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

export type SideCourse = { id: string; title: string; pct: number | null };

function Links({ courses, path }: { courses: SideCourse[]; path: string | null }) {
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {courses.map((c) => {
        const on = path?.startsWith(`/course/${c.id}`) ?? false;
        return (
          <li key={c.id}>
            <Link href={`/course/${c.id}`} aria-current={on ? "page" : undefined} className="flex min-h-11 flex-col justify-center gap-1.5 rounded-xl px-3 py-2 text-sm text-muted hover:text-text aria-[current=page]:bg-panel-2 aria-[current=page]:text-text">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
                <span className="shrink-0 text-xs tabular-nums">{c.pct == null ? "Building" : `${c.pct}%`}</span>
              </span>
              {c.pct != null && (
                <span className="h-1.5 overflow-hidden rounded-full bg-track" aria-hidden="true">
                  <motion.span className={`block h-full rounded-full ${c.pct === 100 ? "bg-green" : "bg-blue"}`} initial={{ width: 0 }} animate={{ width: `${c.pct}%` }} transition={{ type: "spring", stiffness: 200, damping: 30 }} />
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function WithPath({ courses }: { courses: SideCourse[] }) {
  return <Links courses={courses} path={usePathname()} />;
}

export function CourseLinks({ courses }: { courses: SideCourse[] }) {
  return (
    <div className="mt-8">
      <p className="px-3 text-sm font-semibold text-muted">Your courses</p>
      <WithPath courses={courses} />
    </div>
  );
}
