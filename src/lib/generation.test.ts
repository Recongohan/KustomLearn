import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { fakeIntake } from "./ai/fixtures";

process.env.PGLITE_DIR = "memory://";
process.env.APP_SECRET = "test-secret";
process.env.KL_FAKE_AI = "1"; // each fake call reports 11K tokens

const { getDb, schema } = await import("@/db");
const { runOutline, runModule, finalize, progressOf } = await import("./generation");

async function newCourse(capTokens: number, extra: Record<string, unknown> = {}) {
  const db = await getDb();
  const variation = { ...fakeIntake("soc").variations[0], modules: 3, labs: { code: 0, terminal: 0, logs: 0 }, ...extra };
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

  it("never spends past the token cap: shrinks the last call to fit, pauses, resumes once raised", async () => {
    const id = await newCourse(32_000);
    await runOutline(id); // 11K spent
    await runModule(id, 0); // 22K spent; 5K output room is left after the input allowance
    expect(await runModule(id, 1)).toMatchObject({ paused: true }); // cut off at 5K output, charged, paused
    let p = (await progressOf(id, "local"))!;
    expect(p.status).toBe("partial");
    expect(p.spentTokens).toBe(32_000);
    expect(p.modules[1].done).toBe(false);
    expect(await runModule(id, 1)).toMatchObject({ paused: true }); // no room at all: pauses without a call
    expect((await progressOf(id, "local"))!.spentTokens).toBe(32_000);

    const db = await getDb();
    await db.update(schema.courses).set({ budgetCapTokens: 100_000, status: "generating" }).where(eq(schema.courses.id, id));
    await runModule(id, 1);
    await runModule(id, 2);
    await finalize(id);
    p = (await progressOf(id, "local"))!;
    expect(p.status).toBe("ready");
    expect(p.spentTokens).toBe(54_000);
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

  it("validates each lab against its reference solution and repairs a broken one", async () => {
    const id = await newCourse(1_000_000, { modules: 1, labs: { code: 0, terminal: 0, logs: 1 } });
    await runOutline(id);
    await runModule(id, 0); // the fake lab's solution is broken until one repair fixes it
    const db = await getDb();
    const [m] = await db.select().from(schema.modules).where(eq(schema.modules.courseId, id));
    const labs = (m.content as { labs: { kind: string; expected: { rows: unknown[][] } }[] }).labs;
    expect(labs).toHaveLength(1);
    expect(labs[0].kind).toBe("logs");
    expect(labs[0].expected.rows).toEqual([["203.0.113.7", "14"]]);
    const calls = await db.select().from(schema.aiCalls).where(eq(schema.aiCalls.courseId, id));
    expect(calls.map((c) => c.reason)).toEqual(expect.arrayContaining([expect.stringMatching(/^Repair /)]));
    expect((await progressOf(id, "local"))!.spentTokens).toBe(3 * 11_000); // outline, module, one repair
  }, 30_000);
});
