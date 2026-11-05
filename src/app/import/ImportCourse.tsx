"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { importAction } from "./actions";

const MAX = 10_000_000;

/** Pick or drop a .kustom file; it is checked on the server and opens as a new course. */
export function ImportCourse() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const take = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setName(file.name);
    if (file.size > MAX) return setError("That file is too big for a course (10 MB at most).");
    start(async () => {
      const r = await importAction(await file.text());
      if (!r.ok) return setError(r.error);
      router.push(`/course/${r.id}`);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <label
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => (e.preventDefault(), setOver(false), take(e.dataTransfer.files[0]))}
        className={`flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed p-6 text-center transition-colors focus-within:border-blue ${over ? "border-blue bg-blue/10" : "border-track bg-panel hover:border-blue"}`}
      >
        <motion.svg aria-hidden="true" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#4f9dff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" animate={over ? { y: -4 } : { y: 0 }}>
          <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
        </motion.svg>
        <span className="font-display text-xl font-extrabold">{pending ? `Opening ${name}…` : "Choose a .kustom file"}</span>
        <span className="text-sm text-muted">or drop it here. No API key needed.</span>
        <input type="file" accept=".kustom,application/json" className="sr-only" disabled={pending} onChange={(e) => take(e.target.files?.[0])} />
      </label>
      {error && (
        <motion.p role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} className="rounded-2xl bg-pink/15 p-3 text-sm">
          {error}
        </motion.p>
      )}
    </div>
  );
}
