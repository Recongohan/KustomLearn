import { describe, it, expect, beforeAll } from "vitest";
import { fakeIntake } from "./ai/fixtures";

process.env.PGLITE_DIR = "memory://";
process.env.APP_SECRET = "test-secret";
process.env.KL_FAKE_AI = "1";

const { getDb, schema } = await import("@/db");
const { runOutline, runModule, finalize } = await import("./generation");
const { exportCourse, importCourse } = await import("./bundle");
const { playModule, labSubmit } = await import("./player");

describe(".kustom bundles", () => {
  let id: string;
  beforeAll(async () => {
    const db = await getDb();
    const variation = { ...fakeIntake("soc").variations[0], modules: 2, weeks: 1, labs: { code: 0, terminal: 1, logs: 0 } };
    const [c] = await db.insert(schema.courses).values({ userId: "local", title: "Linux triage", request: "soc", intent: "i", category: "c", variation, budgetCapTokens: 1_000_000 }).returning();
    id = c.id;
    await runOutline(id);
    for (const i of [0, 1]) await runModule(id, i);
    await finalize(id);
  }, 60_000);

  it("exports only a finished course of your own, without learner data or costs", async () => {
    expect(await exportCourse(id, "someone-else")).toBeNull();
    const b = (await exportCourse(id, "local"))!;
    expect(b).toMatchObject({ format: "kustomlearn", version: 1, course: { title: "SOC Analyst from Zero" } });
    expect(b.modules).toHaveLength(2);
    const text = JSON.stringify(b);
    for (const secret of ["userId", "spentTokens", "budgetCapTokens", "local"]) expect(text).not.toContain(`"${secret}"`);
  });

  it("imports as a new playable course for another learner", async () => {
    const b = (await exportCourse(id, "local"))!;
    const r = await importCourse(JSON.stringify(b), "friend");
    expect(r.ok).toBe(true);
    const newId = (r as { id: string }).id;
    expect(newId).not.toBe(id);
    expect((await playModule(newId, "friend", 0))!.title).toBe(b.modules[0].title); // level 1 is open
    expect(await playModule(newId, "friend", 1)).toBeNull(); // progress starts fresh: level 2 is locked
    expect(await labSubmit(newId, "friend", 1, 0, { commands: ["mkdir case"] })).toBeNull();
  });

  it("rejects files that aren't courses or are tampered with", async () => {
    const b = (await exportCourse(id, "local"))!;
    expect(await importCourse("{nope", "x")).toMatchObject({ ok: false, error: expect.stringContaining("JSON") });
    expect(await importCourse(JSON.stringify({ ...b, version: 2 }), "x")).toMatchObject({ ok: false });
    expect(await importCourse("x".repeat(10_000_001), "x")).toMatchObject({ ok: false, error: expect.stringContaining("too big") });
    const badQuiz = structuredClone(b);
    badQuiz.modules[0].content.quiz[0].answer = 9;
    expect(await importCourse(JSON.stringify(badQuiz), "x")).toMatchObject({ ok: false });
    const badLab = structuredClone(b);
    const lab = badLab.modules.flatMap((m) => m.content.labs ?? []).find((l) => l.kind === "terminal")!;
    if (lab.kind === "terminal") lab.solution = ["nmap 10.0.0.1"];
    expect(await importCourse(JSON.stringify(badLab), "x")).toMatchObject({ ok: false, error: expect.stringContaining("broken") });
    const zero = structuredClone(b);
    zero.course.variation.modules = 0;
    expect(await importCourse(JSON.stringify(zero), "x")).toMatchObject({ ok: false, error: expect.stringContaining("incomplete") });
    const weeks = structuredClone(b);
    weeks.course.variation.weeks = -3;
    expect(await importCourse(JSON.stringify(weeks), "x")).toMatchObject({ ok: false });
    const short = { ...b, modules: b.modules.slice(0, 1) };
    expect(await importCourse(JSON.stringify(short), "x")).toMatchObject({ ok: false, error: expect.stringContaining("incomplete") });
  });
});
