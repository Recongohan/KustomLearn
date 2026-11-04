import { describe, it, expect, beforeAll } from "vitest";
import { fakeIntake } from "./ai/fixtures";
import { scheduleDates } from "./schedule";

process.env.PGLITE_DIR = "memory://";
process.env.APP_SECRET = "test-secret";
process.env.KL_FAKE_AI = "1";

const { getDb, schema } = await import("@/db");
const { runOutline, runModule, finalize } = await import("./generation");
const { gradeQuiz, starsFor, labStars, courseMap, playModule, checkAnswer, submitQuiz, labHint, labSolution, labSubmit } = await import("./player");

const quiz = [
  { question: "a", choices: ["x", "y"], answer: 0, explanation: "" },
  { question: "b", choices: ["x", "y"], answer: 1, explanation: "" },
  { question: "c", choices: ["x", "y"], answer: 1, explanation: "" },
  { question: "d", choices: ["x", "y"], answer: 0, explanation: "" },
];

describe("grading", () => {
  it("scores deterministically and passes at 70%", () => {
    expect(gradeQuiz(quiz, [0, 1, 1, 0])).toEqual({ correct: [true, true, true, true], score: 1, passed: true });
    expect(gradeQuiz(quiz, [0, 1, 1, 1]).passed).toBe(true); // 75%
    expect(gradeQuiz(quiz, [0, 1, 0, 1]).passed).toBe(false); // 50%
    expect(gradeQuiz(quiz, []).score).toBe(0);
  });
  it("gives 3 stars only for a perfect first try", () => {
    expect(starsFor(gradeQuiz(quiz, [0, 1, 1, 0]), 1)).toBe(3);
    expect(starsFor(gradeQuiz(quiz, [0, 1, 1, 1]), 1)).toBe(2);
    expect(starsFor(gradeQuiz(quiz, [0, 1, 1, 0]), 2)).toBe(1);
    expect(starsFor(gradeQuiz(quiz, [1, 0, 0, 1]), 1)).toBe(0);
  });
});

describe("schedule", () => {
  it("spreads modules evenly over the weeks from the start day", () => {
    expect(scheduleDates("2026-11-04", 2, 4)).toEqual(["2026-11-04", "2026-11-07", "2026-11-11", "2026-11-14"]);
    expect(scheduleDates("2026-12-30", 1, 1)).toEqual(["2026-12-30"]);
  });
});

describe("player", () => {
  let id: string;
  beforeAll(async () => {
    const db = await getDb();
    const variation = { ...fakeIntake("soc").variations[0], modules: 3, labs: { code: 0, terminal: 0, logs: 0 }, weeks: 3 };
    const [c] = await db
      .insert(schema.courses)
      .values({ userId: "local", title: "t", request: "soc", intent: "i", category: "c", variation, budgetCapTokens: 1_000_000 })
      .returning();
    id = c.id;
    await runOutline(id);
    for (const i of [0, 1, 2]) await runModule(id, i);
    await finalize(id);
  });

  it("dates the schedule and opens only the first level", async () => {
    const map = (await courseMap(id, "local"))!;
    expect(map.modules.map((m) => m.unlocked)).toEqual([true, false, false]);
    expect(map.modules.every((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.scheduledOn ?? ""))).toBe(true);
    expect(await courseMap(id, "someone-else")).toBeNull();
  });

  it("sends the quiz without answers and refuses locked levels", async () => {
    const m = (await playModule(id, "local", 0))!;
    expect(m.quiz[0]).not.toHaveProperty("answer");
    expect(m.quiz[0]).not.toHaveProperty("explanation");
    expect(await playModule(id, "local", 1)).toBeNull();
    expect(await checkAnswer(id, "local", 1, 0, 1)).toBeNull();
    expect(await submitQuiz(id, "local", 1, [1])).toBeNull();
  });

  it("grades on the server, opens the next level, and never lowers stars", async () => {
    expect(await checkAnswer(id, "local", 0, 0, 1)).toMatchObject({ correct: true, answer: 1 });
    expect(await submitQuiz(id, "local", 0, [0, 0])).toBeNull(); // wrong number of answers

    const fail = (await submitQuiz(id, "local", 0, [0]))!;
    expect(fail).toMatchObject({ passed: false, stars: 0, next: null });
    expect((await courseMap(id, "local"))!.modules[1].unlocked).toBe(false);

    const pass = (await submitQuiz(id, "local", 0, [1]))!;
    expect(pass).toMatchObject({ passed: true, stars: 1, next: 1 }); // second attempt
    const again = (await submitQuiz(id, "local", 0, [0]))!;
    expect(again.best).toBe(1);

    const map = (await courseMap(id, "local"))!;
    expect(map.modules.map((m) => [m.done, m.stars, m.unlocked])).toEqual([[true, 1, true], [false, 0, true], [false, 0, false]]);
    expect((await submitQuiz(id, "local", 1, [1]))!).toMatchObject({ stars: 3, next: 2 });
  });

  it("lets a level with an empty quiz be cleared after reading", async () => {
    const db = await getDb();
    const { and, eq } = await import("drizzle-orm");
    const [m] = await db.select().from(schema.modules).where(and(eq(schema.modules.courseId, id), eq(schema.modules.position, 2)));
    await db.update(schema.modules).set({ content: { ...(m.content as object), quiz: [] } }).where(eq(schema.modules.id, m.id));
    expect((await playModule(id, "local", 2))!.quiz).toEqual([]);
    expect(await submitQuiz(id, "local", 2, [])).toMatchObject({ passed: true, next: null });
  });
});

describe("labs", () => {
  let id: string;
  beforeAll(async () => {
    const db = await getDb();
    const variation = { ...fakeIntake("soc").variations[0], modules: 2, weeks: 1, labs: { code: 0, terminal: 0, logs: 2 } };
    const [c] = await db
      .insert(schema.courses)
      .values({ userId: "local", title: "t", request: "soc", intent: "i", category: "c", variation, budgetCapTokens: 1_000_000 })
      .returning();
    id = c.id;
    await runOutline(id);
    for (const i of [0, 1]) await runModule(id, i);
    await finalize(id);
  }, 60_000);

  it("scores labs: 3 stars only for a first check with no hints", () => {
    expect(labStars(true, 1, 0, false)).toBe(3);
    expect(labStars(true, 2, 0, false)).toBe(2);
    expect(labStars(true, 1, 1, false)).toBe(2);
    expect(labStars(true, 1, 2, false)).toBe(1);
    expect(labStars(true, 1, 0, true)).toBe(1);
    expect(labStars(false, 1, 0, false)).toBe(0);
  });

  it("sends the lab without its answer, and needs the lab and the quiz to clear the level", async () => {
    const m = (await playModule(id, "local", 0))!;
    expect(m.labs).toHaveLength(1);
    expect(m.labs[0]).toMatchObject({ kind: "logs", hints: 3, state: { done: false, hintsShown: [], canSolve: false, solution: null } });
    for (const secret of ["solution", "walkthrough", "expected", "ordered"]) expect(m.labs[0]).not.toHaveProperty(secret);
    expect(m.labs[0].setup).toContain("create table auth_log");

    const quiz = (await submitQuiz(id, "local", 0, [1]))!;
    expect(quiz).toMatchObject({ passed: true, next: null, last: false }); // the lab is still open
    expect((await courseMap(id, "local"))!.modules[1].unlocked).toBe(false);
  });

  it("grades rows on the server, gates the solution, and opens the next level", async () => {
    const wrong = (await labSubmit(id, "local", 0, 0, { columns: ["ip"], rows: [["10.0.0.1"]] }))!;
    expect(wrong.tests.map((t) => t.pass)).toEqual([false, true, false]); // one row, like the answer, but the wrong one
    expect(await labSolution(id, "local", 0, 0)).toBeNull(); // not yet: no hints used, one failed check

    expect(await labHint(id, "local", 0, 0)).toMatchObject({ hintsShown: ["Only the failed logins matter here."], canSolve: false });
    const right = (await labSubmit(id, "local", 0, 0, { columns: ["source", "n"], rows: [["203.0.113.7", "14"]] }))!;
    expect(right).toMatchObject({ passed: true, stars: 2, levelDone: true, next: 1 });

    const map = (await courseMap(id, "local"))!;
    expect(map.modules[0]).toMatchObject({ done: true, stars: 2 }); // the lower of quiz (3) and lab (2)
    expect(map.modules[1].unlocked).toBe(true);

    await labHint(id, "local", 0, 0);
    expect((await labHint(id, "local", 0, 0))!.canSolve).toBe(true);
    expect(await labSolution(id, "local", 0, 0)).toMatchObject({ solution: expect.stringContaining("having count(*) > 5") });
    expect((await courseMap(id, "local"))!.modules[0].stars).toBe(2); // opening it later never lowers stars already earned
    expect(await labSubmit(id, "local", 1, 5, { columns: [], rows: [] })).toBeNull(); // no such lab
  });
});
