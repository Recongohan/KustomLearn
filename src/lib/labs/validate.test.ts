import { describe, it, expect } from "vitest";
import { validateLab } from "./validate";
import { gradeResult } from "./grade";

const lab = {
  title: "Who failed to log in",
  task: "Find each user with more than 2 failed logins.",
  setup: `create table auth_log (ts timestamptz, username text, ok boolean);
insert into auth_log values ('2026-01-01 10:00Z','amy',false),('2026-01-01 10:01Z','amy',false),('2026-01-01 10:02Z','amy',false),
('2026-01-01 10:03Z','bob',false),('2026-01-01 10:04Z','bob',true),('2026-01-01 10:05Z','cat',false),('2026-01-01 10:06Z','cat',false),('2026-01-01 10:07Z','cat',false),('2026-01-01 10:08Z','cat',false);`,
  starter: "select username from auth_log",
  solution: "select username, count(*) as fails from auth_log where not ok group by username having count(*) > 2",
  walkthrough: "Filter failures, group by user, keep groups over 2.",
  hints: ["Only failed rows matter.", "Group by username.", "Use HAVING count(*) > 2."],
  ordered: false,
};

describe("lab validation", () => {
  it("runs the reference solution in a worker and keeps its result", async () => {
    const r = await validateLab(lab);
    expect(r).toEqual({ ok: true, expected: { columns: ["username", "fails"], rows: expect.arrayContaining([["amy", "3"], ["cat", "4"]]) } });
  });
  it("rejects broken SQL, empty answers and a starter that already answers", async () => {
    expect(await validateLab({ ...lab, solution: "select nope from auth_log" })).toMatchObject({ ok: false });
    expect(await validateLab({ ...lab, solution: "select * from auth_log where false" })).toMatchObject({ ok: false, error: "the solution returns no rows" });
    expect(await validateLab({ ...lab, starter: lab.solution })).toMatchObject({ ok: false, error: "the starter query already gives the answer" });
  });
  it("kills a query that runs too long", async () => {
    const r = await validateLab({ ...lab, solution: "select count(*) from generate_series(1, 10000000000)" });
    expect(r).toMatchObject({ ok: false });
  }, 20_000);
});

describe("grading", () => {
  const expected = { columns: ["u", "n"], rows: [["amy", "3"], ["cat", "4"]] };
  it("ignores row order unless asked, and column names always", () => {
    expect(gradeResult(expected, { columns: ["user", "count"], rows: [["cat", "4"], ["amy", "3"]] }, false).every((t) => t.pass)).toBe(true);
    expect(gradeResult(expected, { columns: ["u", "n"], rows: [["cat", "4"], ["amy", "3"]] }, true).map((t) => t.pass)).toEqual([true, true, false]);
  });
  it("reports which test fails", () => {
    expect(gradeResult(expected, { columns: ["u"], rows: [["amy"]] }, false).map((t) => t.pass)).toEqual([false, false, false]);
    expect(gradeResult(expected, { columns: ["u", "n"], rows: [["amy", "3"], ["bob", "1"]] }, false).map((t) => t.pass)).toEqual([true, true, false]);
  });
});
