"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { ConsentDialog } from "@/components/ConsentDialog";
import type { Variation } from "@/lib/ai/intake";
import type { PricedModel } from "@/lib/ai/pricing";
import { branchEstimate, formatTokens } from "@/lib/estimate";
import { branchAction } from "./actions";

type Props = { courseId: string; levels: { position: number; title: string; done: boolean }[]; variation: Variation; model: PricedModel };

/** Branch from a level with a new direction: earlier levels and their progress are kept, the rest is rewritten. */
export function BranchForm({ courseId, levels, variation, model }: Props) {
  const router = useRouter();
  const firstOpen = levels.find((l) => !l.done)?.position ?? levels.length - 1;
  const [from, setFrom] = useState(Math.min(levels.length - 1, Math.max(1, firstOpen)));
  const [instruction, setInstruction] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const est = branchEstimate(variation, from, model);

  const confirm = () =>
    start(async () => {
      const r = await branchAction(courseId, from, instruction, true);
      if (!r.ok) {
        setAsking(false);
        return setError(r.message);
      }
      router.push(`/course/${r.id}`);
    });

  return (
    <section aria-labelledby="branch-h" className="flex flex-col gap-4 rounded-3xl border border-line bg-panel p-5 md:p-6">
      <div>
        <h2 id="branch-h" className="font-display text-xl font-extrabold">Branch it</h2>
        <p className="mt-1 text-sm text-muted">The plan is locked, but you can take a new direction from any level. You keep the levels before it and your stars on them; this course stays as it is.</p>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Rewrite from level</legend>
        <div className="flex flex-wrap gap-2">
          {levels.map((l) => (
            <button
              key={l.position}
              type="button"
              aria-pressed={from === l.position}
              aria-label={`Level ${l.position + 1}: ${l.title}`}
              title={l.title}
              onClick={() => setFrom(l.position)}
              className="h-11 min-w-11 rounded-xl border-2 border-track bg-panel-2 px-3 font-display font-extrabold text-muted transition-colors aria-pressed:border-blue aria-pressed:bg-blue aria-pressed:text-white"
            >
              {l.position + 1}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">
          Keeps {from === 0 ? "no levels" : from === 1 ? "level 1" : `levels 1 to ${from}`} · rewrites {levels.length - from} from <span className="font-semibold text-text">{levels[from]?.title}</span>
        </p>
      </fieldset>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold">What should change?</span>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="More hands-on Linux, less theory. I already know networking."
          className="w-full resize-y rounded-2xl border-2 border-line bg-panel-2 p-3 text-base outline-none transition-colors focus:border-blue"
        />
      </label>
      {error && (
        <motion.p role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} className="rounded-2xl bg-pink/15 p-3 text-sm">
          {error}
        </motion.p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97, y: 2 }}
          disabled={instruction.trim().length < 3}
          onClick={() => (setError(null), setAsking(true))}
          className="h-12 rounded-2xl bg-blue px-6 font-bold text-white shadow-[0_4px_0_#2f6fc2] disabled:opacity-50"
        >
          Branch from level {from + 1}
        </motion.button>
        <span className="text-sm text-muted">About {formatTokens(est.lowTokens)} to {formatTokens(est.highTokens)} tokens</span>
      </div>
      <ConsentDialog
        open={asking}
        pending={pending}
        reason={`Write ${levels.length - from} new ${levels.length - from === 1 ? "level" : "levels"} for a branch of this course, following your direction.`}
        tokens={formatTokens(est.capTokens)}
        onConfirm={confirm}
        onCancel={() => setAsking(false)}
      />
    </section>
  );
}
