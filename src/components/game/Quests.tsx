"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { claimChestAction, claimQuestAction } from "@/app/game-actions";
import type { GameSummary } from "@/lib/gameplay";
import { Confetti } from "./Reward";

const QUEST_STYLE: Record<string, { color: string; icon: string }> = {
  study: { color: "#2fd18a", icon: "M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" },
  quiz: { color: "#4f9dff", icon: "M9 11l3 3L22 4" },
  lab: { color: "#ff4f7b", icon: "m16 18 6-6-6-6M8 6l-6 6 6 6" },
};

function Claim({ label, onClaim, pending }: { label: string; onClaim: () => void; pending: boolean }) {
  return (
    <motion.button
      type="button"
      onClick={onClaim}
      disabled={pending}
      whileTap={{ scale: 0.94, y: 2 }}
      animate={{ scale: [1, 1.06, 1] }}
      transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
      className="h-11 shrink-0 rounded-xl bg-gold px-4 text-sm font-extrabold text-[#3a2700] shadow-[0_3px_0_#b98a12] disabled:opacity-60"
    >
      {label}
    </motion.button>
  );
}

/** Today's quests, each claimable once it's done. Claiming pays XP with a burst of confetti. */
export function Quests({ quests, chest, showChest = false }: { quests: GameSummary["quests"]; chest: GameSummary["chest"]; showChest?: boolean }) {
  const router = useRouter();
  const [claimed, setClaimed] = useState(() => new Set<string>(quests.filter((q) => q.claimed).map((q) => q.id)));
  const [chestOpen, setChestOpen] = useState(chest.claimed);
  const [burst, setBurst] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const claim = (id: string) =>
    start(async () => {
      const r = await claimQuestAction(id);
      if (!r) return;
      setClaimed((s) => new Set(s).add(id));
      setBurst(id);
      router.refresh(); // XP, level and the chart update
    });

  const openChest = () =>
    start(async () => {
      const r = await claimChestAction();
      if (!r) return;
      setChestOpen(true);
      setBurst("chest");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {quests.map((q) => {
          const s = QUEST_STYLE[q.id];
          const isClaimed = claimed.has(q.id);
          return (
            <li key={q.id} className="relative flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: isClaimed ? "var(--track)" : s.color }}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0e0f12" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={s.icon} /></svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`truncate font-semibold ${isClaimed ? "text-muted line-through" : ""}`}>{q.title}</p>
                  <p className="shrink-0 text-sm tabular-nums text-muted">{q.have} / {q.goal}{q.unit ? ` ${q.unit}` : ""}</p>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-track" role="progressbar" aria-label={q.title} aria-valuemin={0} aria-valuemax={q.goal} aria-valuenow={q.have}>
                  <div className="kl-grow h-full rounded-full" style={{ width: `${(q.have / q.goal) * 100}%`, background: s.color }} />
                </div>
              </div>
              {isClaimed ? (
                <span className="relative grid h-11 min-w-16 place-items-center rounded-xl border border-line px-3 text-sm font-bold text-green-ink">
                  Claimed
                  {burst === q.id && <Confetti />}
                </span>
              ) : q.done ? (
                <Claim label={`Claim +${q.xp}`} onClaim={() => claim(q.id)} pending={pending} />
              ) : (
                <span className="grid h-11 min-w-16 place-items-center rounded-xl bg-panel-2 px-3 text-sm font-bold text-muted">+{q.xp}</span>
              )}
            </li>
          );
        })}
      </ul>
      {showChest && (
        <div className="relative mt-2 flex flex-col items-center gap-3 rounded-3xl bg-panel-2 p-5 text-center">
          <AnimatePresence mode="wait">
            <motion.svg key={chestOpen ? "open" : "shut"} aria-hidden="true" width="88" height="80" viewBox="0 0 88 80" initial={{ scale: 0.8, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 400, damping: 14 }}>
              <rect x="8" y={chestOpen ? 30 : 34} width="72" height="42" rx="8" fill="#c0763a" />
              <path d={chestOpen ? "M8 30 L16 6 H72 L80 30 Z" : "M8 34 Q44 8 80 34 Z"} fill="#e8a06a" />
              <rect x="38" y="40" width="12" height="14" rx="3" fill="#ffc23d" />
              <rect x="8" y="48" width="72" height="6" fill="#8a4f22" />
            </motion.svg>
          </AnimatePresence>
          <h3 className="font-display text-xl font-extrabold">Weekly chest</h3>
          <p className="text-sm text-muted">Clear {chest.goal} labs this week to open it. Inside: {chest.xp} XP and a streak freeze.</p>
          <div className="w-full max-w-60">
            <div className="h-2.5 overflow-hidden rounded-full bg-track" role="progressbar" aria-label="Labs cleared this week" aria-valuemin={0} aria-valuemax={chest.goal} aria-valuenow={chest.have}><div className="kl-grow h-full rounded-full bg-orange" style={{ width: `${(chest.have / chest.goal) * 100}%` }} /></div>
            <p className="mt-1.5 text-sm tabular-nums">{chest.have} of {chest.goal} labs</p>
          </div>
          {chestOpen ? (
            <p className="font-bold text-green-ink">Opened this week</p>
          ) : chest.have >= chest.goal ? (
            <Claim label={`Open it · +${chest.xp} XP`} onClaim={openChest} pending={pending} />
          ) : null}
          {burst === "chest" && <Confetti pieces={28} />}
        </div>
      )}
    </div>
  );
}
