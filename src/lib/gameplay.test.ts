import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { fakeIntake } from "./ai/fixtures";
import { localDay } from "./game";

process.env.PGLITE_DIR = "memory://";
process.env.APP_SECRET = "test-secret";
process.env.KL_FAKE_AI = "1";

const { getDb, schema } = await import("@/db");
const { runOutline, runModule, finalize } = await import("./generation");
const { submitQuiz, labSubmit } = await import("./player");
const { award, claimChest, claimQuest, gameSummary, studyBeat } = await import("./gameplay");

const U = "local";
const today = localDay(new Date(), "UTC"); // no request in tests, so days are UTC

describe("gameplay", () => {
  let id: string;
  beforeAll(async () => {
    const db = await getDb();
    const variation = { ...fakeIntake("soc").variations[0], modules: 1, weeks: 1, labs: { code: 0, terminal: 1, logs: 0 } };
    const [c] = await db.insert(schema.courses).values({ userId: U, title: "t", request: "soc", intent: "i", category: "c", variation, budgetCapTokens: 1_000_000 }).returning();
    id = c.id;
    await runOutline(id);
    await runModule(id, 0);
    await finalize(id);
  }, 60_000);

  it("starts empty", async () => {
    const g = await gameSummary(U);
    expect(g).toMatchObject({ xp: 0, level: { level: 1 }, streak: { days: 0, freezes: 1 }, rank: { name: "Iron" } });
    expect(g.quests.every((q) => !q.done)).toBe(true);
    expect(g.trophies.some((t) => t.earned)).toBe(false);
  });

  it("pays XP once per result and only the difference when stars go up", async () => {
    const first = (await submitQuiz(id, U, 0, [0]))!; // wrong
    expect(first.xp).toBe(0);
    const pass = (await submitQuiz(id, U, 0, [1]))!; // second try: 1 star
    expect(pass).toMatchObject({ stars: 1, xp: 30 });
    expect((await submitQuiz(id, U, 0, [1]))!.xp).toBe(0); // same stars again pays nothing
    // The only lab of the last level is a mini-boss: 1.5× XP.
    const lab = (await labSubmit(id, U, 0, 0, { commands: ["mkdir case", "grep 'Failed password' /var/log/auth.log | cut -d' ' -f12 | sort -u > case/ips.txt"] }))!;
    expect(lab).toMatchObject({ passed: true, boss: true, stars: 3, xp: 150 });
    expect((await gameSummary(U)).xp).toBe(180);
  }, 30_000);

  it("unlocks quests, the chest and trophies from what happened", async () => {
    const g = await gameSummary(U);
    expect(g.quests.map((q) => [q.id, q.done])).toEqual([["study", false], ["quiz", true], ["lab", true]]);
    expect(g.streak).toMatchObject({ days: 1, studiedToday: true });
    expect(g.trophies.filter((t) => t.earned).map((t) => t.id)).toEqual(["first-lab", "boss", "finisher"]);
    expect(g.week.find((d) => d.day === today)!.xp).toBe(180);

    expect(await claimQuest(U, "study")).toBeNull(); // not done yet
    expect(await claimQuest(U, "nope")).toBeNull();
    expect(await claimQuest(U, "lab")).toEqual({ xp: 50 });
    expect(await claimQuest(U, "lab")).toEqual({ xp: 0 }); // already claimed
    expect(await claimChest(U)).toBeNull(); // 1 of 3 labs this week
  });

  it("opens the chest after three labs this week, with a freeze inside", async () => {
    await award(U, "lab:x:a:1", "lab", 1);
    await award(U, "lab:x:b:1", "lab", 1);
    expect(await claimChest(U)).toEqual({ xp: 300 });
    expect(await claimChest(U)).toEqual({ xp: 0 });
    const g = await gameSummary(U);
    expect(g.chest.claimed).toBe(true);
    expect(g.streak.freezes).toBe(2);
  });

  it("counts study minutes at most once a beat", async () => {
    expect(await studyBeat(U)).toBe(1);
    expect(await studyBeat(U)).toBe(1); // too soon
    const db = await getDb();
    await db.update(schema.studyDays).set({ lastBeatAt: new Date(Date.now() - 60_000) }).where(eq(schema.studyDays.userId, U));
    expect(await studyBeat(U)).toBe(2);
    expect((await gameSummary(U)).goal.minutes).toBe(2);
  });

  it("counts a re-clear for quests and the chest, but not a chest claim as study", async () => {
    const db = await getDb();
    expect((await submitQuiz(id, U, 0, [1]))!.xp).toBe(0); // already paid
    const keys = (await db.select().from(schema.xpEvents).where(eq(schema.xpEvents.userId, U))).map((e) => e.key);
    expect(keys).toContain(`quiz:${id}:module-0:clear:${today}`);
    await award("u2", "chest:2026-01-05", "chest", 300); // a chest on its own isn't a study day
    expect((await gameSummary("u2")).streak).toMatchObject({ days: 0, studiedToday: false });
  });
});
