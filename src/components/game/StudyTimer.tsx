"use client";
import { useEffect } from "react";
import { studyBeatAction } from "@/app/game-actions";

const IDLE_MS = 3 * 60_000; // no input for this long and the minute doesn't count

/** Counts study minutes for Pip's daily goal: one beat a minute while the lesson is in view and the learner is active. */
export function StudyTimer() {
  useEffect(() => {
    let last: number | null = null; // nothing counts until the learner actually does something
    const seen = () => (last = Date.now());
    const events = ["pointerdown", "keydown", "scroll", "pointermove"] as const;
    for (const e of events) window.addEventListener(e, seen, { passive: true });
    const t = setInterval(() => {
      if (last !== null && document.visibilityState === "visible" && Date.now() - last < IDLE_MS) void studyBeatAction().catch(() => {});
    }, 60_000);
    return () => {
      clearInterval(t);
      for (const e of events) window.removeEventListener(e, seen);
    };
  }, []);
  return null;
}
