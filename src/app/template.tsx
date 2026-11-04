"use client";
import { motion, MotionConfig } from "motion/react";

const STRIPES = ["#4f9dff", "#ffc23d", "#2fd18a", "#ff4f7b"];
const ease = [0.7, 0, 0.3, 1] as const;

/** Re-mounts on every navigation: a four-colour wipe, then the page rises in. Reduced motion: no wipe, no travel. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 flex flex-col motion-reduce:hidden">
        {STRIPES.map((c, i) => (
          <motion.span
            key={c}
            className="flex-1"
            style={{ background: c }}
            initial={{ x: "-101%" }}
            animate={{ x: ["-101%", "0%", "0%", "101%"] }}
            transition={{ duration: 0.7, times: [0, 0.42, 0.58, 1], ease, delay: i * 0.04 }}
          />
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.32 }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
