import { connection } from "next/server";
import { Suspense } from "react";
import { Panel, Trophy } from "@/components/game/parts";
import { gameSummary } from "@/lib/gameplay";
import { currentUserId } from "@/lib/settings";

async function Cabinet() {
  await connection();
  const g = await gameSummary(currentUserId());
  const earned = g.trophies.filter((t) => t.earned).length;
  return (
    <>
      <p className="kl-in -mt-3 text-muted">{earned} of {g.trophies.length} earned. Locked ones show what it takes.</p>
      <Panel>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {g.trophies.map((t, i) => <Trophy key={t.id} t={t} i={i} size={72} />)}
        </ul>
      </Panel>
    </>
  );
}

export default function TrophiesPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <h1 className="kl-in font-display text-3xl font-extrabold tracking-tight md:text-4xl">Trophies</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-panel" />}>
        <Cabinet />
      </Suspense>
    </div>
  );
}
