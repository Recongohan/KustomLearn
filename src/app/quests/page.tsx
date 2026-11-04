import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Quests } from "@/components/game/Quests";
import { Panel } from "@/components/game/parts";
import { gameSummary } from "@/lib/gameplay";
import { homeCourse } from "@/lib/player";
import { currentUserId } from "@/lib/settings";

async function QuestBoard() {
  await connection();
  const userId = currentUserId();
  const [g, c] = await Promise.all([gameSummary(userId), homeCourse(userId)]);
  return (
    <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
      <Panel title="Daily" aside="Resets at midnight">
        <Quests quests={g.quests} chest={g.chest} />
        {c?.next && (
          <Link href={`/course/${c.id}/m/${c.next.position + 1}`} className="mt-2 flex h-12 w-fit items-center rounded-2xl bg-green px-6 font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] transition-transform hover:-translate-y-px active:translate-y-0.5">
            Play level {c.next.position + 1}
          </Link>
        )}
      </Panel>
      <Panel title="This week" aside="Opens on any day once full" delay={80}>
        <Quests quests={[]} chest={g.chest} showChest />
      </Panel>
    </div>
  );
}

export default function QuestsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header className="kl-in">
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Quests</h1>
        <p className="mt-1.5 text-muted">Daily quests pay XP once you&apos;ve done them. Clear three labs in a week to open the chest.</p>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-panel" />}>
        <QuestBoard />
      </Suspense>
    </div>
  );
}
