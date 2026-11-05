import { describe, it, expect, beforeAll } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { fakeIntake } from "./ai/fixtures";

process.env.PGLITE_DIR = "memory://";
process.env.APP_SECRET = "test-secret";
process.env.KL_FAKE_AI = "1";

const { getDb, schema } = await import("@/db");
const { runOutline, runModule, finalize } = await import("./generation");
const { createBranch } = await import("./branch");
const { submitQuiz, courseMap } = await import("./player");

describe("branching", () => {
  let id: string;
  beforeAll(async () => {
    const db = await getDb();
    const variation = { ...fakeIntake("soc").variations[0], modules: 3, weeks: 1, labs: { code: 0, terminal: 0, logs: 0 } };
    const [c] = await db.insert(schema.courses).values({ userId: "local", title: "t", request: "soc", intent: "i", category: "c", variation, budgetCapTokens: 1_000_000 }).returning();
    id = c.id;
    await runOutline(id);
    for (const i of [0, 1, 2]) await runModule(id, i);
    await finalize(id);
    await submitQuiz(id, "local", 0, [1]); // level 1 cleared with 3 stars
  }, 60_000);

  it("refuses courses that aren't yours or levels that don't exist", async () => {
    expect(await createBranch(id, "someone-else", 1, "more labs", "claude-opus-5-5")).toBeNull();
    expect(await createBranch(id, "local", 3, "more labs", "claude-opus-5-5")).toBeNull();
  });

  it("keeps earlier levels and their stars, then writes the rest", async () => {
    const db = await getDb();
    const branch = (await createBranch(id, "local", 1, "more Linux, less theory", "claude-opus-5-5"))!;
    const [c] = await db.select().from(schema.courses).where(eq(schema.courses.id, branch));
    expect(c).toMatchObject({ status: "draft", parentCourseId: id, forkedAtModule: 1 });
    expect(c.budgetCapTokens).toBeGreaterThan(0);
    expect((c.variation as { branch: { instruction: string } }).branch.instruction).toBe("more Linux, less theory");

    expect(await runOutline(branch)).toEqual({ paused: false, modules: 3 });
    for (const i of [0, 1, 2]) await runModule(branch, i);
    await finalize(branch);

    const [parentMods, mods] = await Promise.all(
      [id, branch].map((x) => db.select().from(schema.modules).where(eq(schema.modules.courseId, x)).orderBy(asc(schema.modules.position))),
    );
    expect(mods).toHaveLength(3);
    expect(mods[0].content).toEqual(parentMods[0].content); // kept as it was
    expect(mods[0].title).toBe(parentMods[0].title);
    const map = (await courseMap(branch, "local"))!;
    expect(map.modules.map((m) => [m.done, m.stars, m.unlocked])).toEqual([[true, 3, true], [false, 0, true], [false, 0, false]]);
    const rows = await db.select().from(schema.progress).where(and(eq(schema.progress.courseId, branch), eq(schema.progress.userId, "local")));
    expect(rows.map((r) => r.itemId)).toEqual(["module-0"]);
  }, 60_000);
});
