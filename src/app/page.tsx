import Link from "next/link";
import { Suspense } from "react";
import { Pip } from "@/components/Pip";
import { getSettings } from "@/lib/settings";

async function KeyStatus() {
  const { hasKey } = await getSettings();
  if (!hasKey)
    return (
      <Link href="/settings" className="inline-flex h-13 items-center gap-2 rounded-2xl bg-green px-5 text-base font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] transition-transform hover:-translate-y-px active:translate-y-px">
        Connect your Anthropic key
      </Link>
    );
  return <p className="text-muted">Key connected. The course builder lands in the next milestone.</p>;
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
    </div>
  );
}
