import Link from "next/link";
import { Suspense } from "react";
import { getSettings } from "@/lib/settings";
import { NewCourse } from "./NewCourse";

async function Flow() {
  const { hasKey, model } = await getSettings();
  if (!hasKey && process.env.KL_FAKE_AI !== "1")
    return (
      <div className="rounded-3xl border border-line bg-panel p-6">
        <p className="mb-4 text-muted">KustomLearn needs your Anthropic key to design a course. A course someone shared with you needs no key.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/settings" className="inline-flex h-12 items-center rounded-2xl bg-text px-5 font-bold text-bg">Add your key</Link>
          <Link href="/import" className="inline-flex h-12 items-center rounded-2xl border border-line px-5 font-bold">Import a .kustom file</Link>
        </div>
      </div>
    );
  return <NewCourse model={model} />;
}

export default function NewCoursePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <Suspense fallback={<div className="h-80 animate-pulse rounded-3xl bg-panel" />}>
        <Flow />
      </Suspense>
      <p className="mt-6 text-sm text-muted">
        Have a course file? <Link href="/import" className="font-semibold text-blue-ink underline underline-offset-4">Import a .kustom file</Link>
      </p>
    </div>
  );
}
