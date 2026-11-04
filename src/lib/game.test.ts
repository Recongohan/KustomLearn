import { describe, it, expect } from "vitest";
import { addDays, foldStreak, isBoss, itemXp, levelOf, localDay, questsFor, weekStart } from "./game";

const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

describe("game rules", () => {
  it("reads days in the learner's zone", () => {
    const t = new Date("2026-11-04T23:30:00Z");
    expect(localDay(t, "UTC")).toBe("2026-11-04");
    expect(localDay(t, "Asia/Kolkata")).toBe("2026-11-05");
    expect(localDay(t, "Not/AZone")).toBe("2026-11-04");
    expect(weekStart("2026-11-04")).toBe("2026-11-02"); // a Wednesday's week starts Monday
  });

  it("pays XP by stars, with more for bosses, and names levels", () => {
    expect([0, 1, 2, 3].map((s) => itemXp("quiz", s))).toEqual([0, 30, 40, 50]);
    expect(itemXp("lab", 3, true)).toBe(150);
    expect(levelOf(0)).toMatchObject({ level: 1, name: "Fresh install", into: 0, need: 100 });
    expect(levelOf(100)).toMatchObject({ level: 2, from: 100, to: 300 });
    expect(levelOf(2340)).toMatchObject({ level: 7, from: 2100, to: 2800, need: 460 });
  });

  it("grows a streak, ranks up, and never counts today as missed", () => {
    const s = foldStreak(new Set(days("2026-10-01", 8)), [], "2026-10-09");
    expect(s).toMatchObject({ streak: 8, best: 8, tier: 2 }); // Silver at 7
    expect(s.marks.get("2026-10-09")).toBe("today");
  });

  it("spends a freeze on a missed day, then drops a rank when none are left", () => {
    const active = new Set([...days("2026-10-01", 7), ...days("2026-10-10", 2)]); // misses Oct 8 and 9
    const s = foldStreak(active, [], "2026-10-11");
    expect(s.marks.get("2026-10-08")).toBe("frozen");
    expect(s.marks.get("2026-10-09")).toBe("missed");
    expect(s).toMatchObject({ streak: 2, best: 7, tier: 1, bestTier: 2, freezes: 0 }); // Silver dropped to Bronze
  });

  it("earns freezes from chests and from Mondays at Silver, two at most", () => {
    const active = new Set(days("2026-10-01", 20)); // Oct 1 is a Thursday
    const s = foldStreak(active, ["2026-10-02", "2026-10-03"], "2026-10-20");
    expect(s.freezes).toBe(2);
  });

  it("tracks quests and marks mini-bosses", () => {
    const q = questsFor({ minutes: 45, quizzes: 0, labs: 2 }, new Set(["lab"]));
    expect(q.map((x) => [x.id, x.have, x.done, x.claimed])).toEqual([["study", 30, true, false], ["quiz", 0, false, false], ["lab", 1, true, true]]);
    expect([isBoss(2, 9, 1, 2), isBoss(2, 9, 0, 2), isBoss(1, 9, 0, 1), isBoss(8, 9, 0, 1)]).toEqual([true, false, false, true]);
  });
});
