"use client";
import { motion, useReducedMotion } from "motion/react";

const COLORS = ["#4f9dff", "#ffc23d", "#2fd18a", "#ff4f7b", "#ff7a2f"];

/** A short burst of confetti from the middle of its parent (which must be `relative`). Nothing with reduced motion. */
export function Confetti({ pieces = 18 }: { pieces?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
      {Array.from({ length: pieces }, (_, i) => {
        const a = (i / pieces) * Math.PI * 2 + (i % 3) * 0.3;
        const d = 50 + ((i * 37) % 50);
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 h-2 w-1.5 rounded-[2px]"
            style={{ background: COLORS[i % COLORS.length] }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d - 24, opacity: 0, rotate: (i * 67) % 540 }}
            transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
          />
        );
      })}
    </span>
  );
}

/** "+40 XP", popping in with confetti. Renders nothing for 0. */
export function XpGain({ xp, boss }: { xp: number; boss?: boolean }) {
  if (xp <= 0) return null;
  return (
    <motion.span
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 18, delay: 0.3 }}
      className="relative inline-flex h-9 w-fit items-center rounded-full bg-gold px-4 font-display text-base font-extrabold text-[#3a2700]"
    >
      +{xp} XP{boss ? " · mini-boss" : ""}
      <Confetti />
    </motion.span>
  );
}
