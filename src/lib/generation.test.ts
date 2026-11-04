import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { fakeIntake } from "./ai/fixtures";

process.env.PGLITE_DIR = "memory://";
process.env.APP_SECRET = "test-secret";
process.env.KL_FAKE_AI = "1"; // each fake call reports 11K tokens

const { getDb, schema } = await import("@/db");
const { runOutline, runModule, finalize, progressOf } = await import("./generation");

async function newCourse(capTokens: number) {
  const db = await getDb();
  const variation = { ...fakeIntake("soc").variations[0], modules: 3 };
  const [c] = await db
    .insert(schema.courses)
    .values({ userId: "local", title: "t", request: "soc", intent: "i", category: "c", variation, budgetCapTokens: capTokens })
    .returning();
  return c.id;
}

describe("generation pipeline", () => {
  beforeAll(async () => {
    await getDb();
  });

  it("builds outline, modules and finishes, idempotently", async () => {
    const id = await newCourse(1_000_000);
    expect(await runOutline(id)).toEqual({ paused: false, modules: 3 });
    await runOutline(id); // a retried step must not duplicate modules
    for (const i of [0, 1, 2]) await runModule(id, i);
    await runModule(id, 1); // retry of a finished module spends nothing
    await finalize(id);

    const p = (await progressOf(id, "local"))!;
    expect(p.status).toBe("ready");
    expect(p.modules).toHaveLength(3);
    expect(p.modules.every((m) => m.done)).toBe(true);
    expect(p.spentTokens).toBe(4 * 11_000);
    const db = await getDb();
    expect(await db.select().from(schema.aiCalls).where(eq(schema.aiCalls.courseId, id))).toHaveLength(4);
  });

  it("pauses at the token cap instead of spending past it, then resumes once raised", async () => {
    const id = await newCourse(15_000);
    await runOutline(id); // 11K spent
    await runModule(id, 0); // 22K spent: allowed, cap was not reached before the step
    expect(await runModule(id, 1)).toMatchObject({ paused: true });
    const p = (await progressOf(id, "local"))!;
    expect(p.status).toBe("partial");
    expect(p.spentTokens).toBe(22_000);

    const db = await getDb();
    await db.update(schema.courses).set({ budgetCapTokens: 100_000, status: "generating" }).where(eq(schema.courses.id, id));
    await runModule(id, 1);
    await runModule(id, 2);
    await finalize(id);
    expect((await progressOf(id, "local"))!.status).toBe("ready");
  });

  it("refuses to finalize with missing modules", async () => {
    const id = await newCourse(1_000_000);
    await runOutline(id);
    await expect(finalize(id)).rejects.toThrow(/no content/);
  });

  it("hides another user's course", async () => {
    const id = await newCourse(1_000_000);
    expect(await progressOf(id, "someone-else")).toBeNull();
  });
});
