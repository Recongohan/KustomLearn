import { connection } from "next/server";
import { Suspense } from "react";
import { Bar, Panel, RANK_COLORS, Shield } from "@/components/game/parts";
import { gameSummary } from "@/lib/gameplay";
import { RANKS } from "@/lib/game";
import { currentUserId } from "@/lib/settings";

// Each buddy: body colours and its own ears, horns or cloud. Locked ones are drawn in the track colour.
const LOOK: Record<string, { c1: string; c2: string; extra: string }> = {
  pip: { c1: "#4f9dff", c2: "#ffc23d", extra: "M38 6h4v16h-4z" },
  bit: { c1: "#e8a06a", c2: "#c0763a", extra: "M16 30 20 6l14 16zM64 30 60 6 46 22z" },
  hoot: { c1: "#c9a46b", c2: "#8a6a3a", extra: "M14 28 18 8l12 14zM66 28 62 8 50 22z" },
  nimbus: { c1: "#c4f5f2", c2: "#8fe0db", extra: "M10 34a14 14 0 0 1 22-18 16 16 0 0 1 26 2 12 12 0 0 1 14 16z" },
  jade: { c1: "#22c55e", c2: "#15803d", extra: "M22 24 26 2l10 20zM58 24 54 2 44 22z" },
};

function Buddy({ id, have }: { id: string; have: boolean }) {
  const l = LOOK[id];
  const c1 = have ? l.c1 : "var(--track)", c2 = have ? l.c2 : "var(--line)";
  return (
    <svg aria-hidden="true" width="80" height="80" viewBox="0 0 80 80" className={have ? "kl-bob" : ""}>
      <path d={l.extra} fill={c2} />
      <rect x="12" y="20" width="56" height="54" rx="22" fill={c1} />
      <circle cx="30" cy="44" r="6" fill="#fff" opacity={have ? 1 : 0.5} />
      <circle cx="50" cy="44" r="6" fill="#fff" opacity={have ? 1 : 0.5} />
      <circle cx="31" cy="45" r="3" fill={have ? "#0e0f12" : "var(--muted)"} />
      <circle cx="51" cy="45" r="3" fill={have ? "#0e0f12" : "var(--muted)"} />
      {have && <path d="M34 56q6 5 12 0" stroke="#0e0f12" strokeWidth="3" fill="none" strokeLinecap="round" />}
    </svg>
  );
}

async function Ladder() {
  await connection();
  const g = await gameSummary(currentUserId());
  const r = g.rank;
  const cur = RANKS[r.tier], next = RANKS[r.tier + 1];
  return (
    <>
      <Panel className="items-center gap-6 sm:flex-row">
        <Shield tier={r.tier} size={120} />
        <div className="flex w-full flex-col gap-2">
          <p className="text-sm text-muted">Current rank</p>
          <p className="font-display text-5xl font-extrabold leading-none" style={{ color: RANK_COLORS[r.tier] }}>{r.name}</p>
          <p className="text-muted">
            {g.streak.days}-day streak{next ? ` · ${next.name} at ${next.from} days` : " · the top rank"}
          </p>
          {next && <div className="max-w-md"><Bar value={Math.max(0, g.streak.days - cur.from)} of={next.from - cur.from} color={RANK_COLORS[r.tier + 1]} h={12} label={`Streak days to ${next.name}`} /></div>}
          {next && <p className="text-sm">Study {r.next!.in} more {r.next!.in === 1 ? "day" : "days"} in a row to reach {next.name}: {next.reward.toLowerCase()}.</p>}
        </div>
      </Panel>

      <section aria-labelledby="ladder-h" className="flex flex-col gap-3">
        <h2 id="ladder-h" className="font-display text-2xl font-extrabold">The ladder</h2>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {g.ranks.map((x, i) => (
            <li key={x.name} className={`kl-in flex flex-col items-center gap-1.5 rounded-3xl bg-panel p-4 text-center ${x.state === "current" ? "border-2 border-gold lg:-translate-y-1.5" : "border border-line"} ${x.state === "locked" ? "opacity-70" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
              <span className={x.state === "locked" ? "grayscale" : ""}><Shield tier={i} size={44} /></span>
              <span className="font-display text-lg font-extrabold">{x.name}</span>
              <span className="text-xs text-muted">{x.from === 60 ? "60+ days" : `${x.from} to ${(RANKS[i + 1]?.from ?? 61) - 1} days`}</span>
              <span className="text-xs">{x.reward}</span>
              <span className={`mt-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${x.state === "current" ? "bg-gold text-[#3a2700]" : x.state === "earned" ? "bg-panel-2 text-green-ink" : "bg-panel-2 text-muted"}`}>
                {x.state === "current" ? "You are here" : x.state === "earned" ? "Reached" : "Locked"}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">Your rank climbs with your streak. Miss a day without a freeze and you drop one rank.</p>
      </section>

      <section aria-labelledby="buddies-h" className="flex flex-col gap-3">
        <h2 id="buddies-h" className="font-display text-2xl font-extrabold">Study buddies</h2>
        <p className="-mt-1 text-sm text-muted">Each rank brings a buddy. {g.buddies.filter((b) => b.have).length} of {g.buddies.length} collected.</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {g.buddies.map((b) => (
            <li key={b.id} className={`flex flex-col items-center gap-1 rounded-3xl border border-line bg-panel p-4 text-center ${b.have ? "" : "opacity-75"}`}>
              <Buddy id={b.id} have={b.have} />
              <span className="font-display text-lg font-extrabold">{b.name}</span>
              <span className="text-xs text-muted">{b.have ? (b.id === "pip" ? "Your starter" : "Collected") : b.how}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default function RanksPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <h1 className="kl-in font-display text-3xl font-extrabold tracking-tight md:text-4xl">Ranks</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-panel" />}>
        <Ladder />
      </Suspense>
    </div>
  );
}
