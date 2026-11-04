import { describe, it, expect } from "vitest";
import { validateLab, validateTerminalLab } from "./validate";
import { FAKE_TERMINAL_LAB } from "../ai/fixtures";
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

import { validateCodeLab } from "./validate";
import { runPython } from "./run-python";

const py = {
  title: "Count failed logins",
  task: "Write `count_failures(events)`: return how many events have `ok` false.",
  language: "python" as const,
  entry: "count_failures",
  starter: "def count_failures(events):\n    return 0\n",
  solution: "def count_failures(events):\n    return sum(1 for e in events if not e['ok'])\n",
  walkthrough: "Count the events whose ok is False.",
  hints: ["Loop over events.", "Check e['ok'].", "sum() over a generator."],
  tests: [
    { name: "none", args: "[[]]" },
    { name: "one failure", args: '[[{"ok": false}, {"ok": true}]]' },
    { name: "all fail", args: '[[{"ok": false}, {"ok": false}, {"ok": false}]]' },
  ],
};
const js = { ...py, language: "javascript" as const, entry: "countFailures", starter: "function countFailures(events) { return 0 }", solution: "function countFailures(events) { return events.filter((e) => !e.ok).length }" };

describe("code lab validation", () => {
  it("validates a Python lab in the sandboxed child", async () => {
    // "none" returns 0, which the starter also returns, but not every test: the lab is fine.
    expect(await validateCodeLab(py)).toMatchObject({ ok: true, expected: ["0", "1", "3"] });
  }, 60_000);
  it("validates a JavaScript lab in QuickJS", async () => {
    expect(await validateCodeLab(js)).toMatchObject({ ok: true, expected: ["0", "1", "3"] });
  });
  it("rejects bad names, bad tests, failing solutions and a passing starter", async () => {
    expect(await validateCodeLab({ ...js, entry: "x; evil()" })).toMatchObject({ ok: false });
    expect(await validateCodeLab({ ...js, tests: [...js.tests.slice(0, 2), { name: "bad", args: "{" }] })).toMatchObject({ ok: false });
    expect(await validateCodeLab({ ...js, solution: "function countFailures(e) { throw new Error('nope') }" })).toMatchObject({ ok: false });
    expect(await validateCodeLab({ ...js, starter: js.solution })).toMatchObject({ ok: false, error: "the starter code already passes every test" });
    expect(await validateCodeLab({ ...js, solution: "function countFailures(e) { while (true) {} }" })).toMatchObject({ ok: false });
  });
  it("keeps Python away from the network, files, subprocesses and secrets", async () => {
    process.env.SECRET_FOR_TEST = "s3cret";
    const probe = (body: string) => `import json\ndef probe():\n${body.split("\n").map((l) => "    " + l).join("\n")}\n`;
    const runs = await runPython(
      [
        probe("import os\nreturn sorted(os.environ.keys())"),
        probe("from pyodide.code import run_js\nreturn str(run_js(\"typeof process.env.SECRET_FOR_TEST\"))"),
        probe("try:\n    open('/etc/hostname').read()\n    return 'read'\nexcept Exception as e:\n    return 'blocked'"),
        probe("from pyodide.code import run_js\ntry:\n    run_js(\"require('net')\")\n    return 'open'\nexcept Exception:\n    return 'blocked'"),
      ],
      "probe",
      ["[]"],
    );
    const values = runs.map((r) => ("results" in r ? r.results[0].value : r.error));
    expect(values[0]).not.toContain("SECRET_FOR_TEST");
    expect(values[1]).toBe('"undefined"');
    expect(values[2]).toBe('"blocked"');
    expect(values[3]).toBe('"blocked"');
  }, 60_000);
  it("caps what Python returns and prints before building it", async () => {
    const [r] = await runPython(["def big():\n    for _ in range(200000):\n        print('x' * 50)\n    return ['y' * 1000] * 5000\n"], "big", ["[]"]);
    expect("results" in r && r.results[0].value!.length).toBe(20_000);
    expect("stdout" in r && r.stdout.length).toBeLessThanOrEqual(20_000);
  }, 60_000);

  it("accepts a terminal lab whose solution turns every check green, and rejects broken ones", () => {
    const t = FAKE_TERMINAL_LAB;
    expect(validateTerminalLab(t)).toEqual({ ok: true });
    expect(validateTerminalLab({ ...t, solution: ["mkdir case", "awk '{print $12}' /var/log/auth.log > case/ips.txt"] })).toMatchObject({ ok: false, error: expect.stringContaining("command not found") });
    expect(validateTerminalLab({ ...t, solution: ["mkdir case"] })).toMatchObject({ ok: false, error: expect.stringContaining("still fails") });
    expect(validateTerminalLab({ ...t, checks: [{ name: "log there", kind: "exists", path: "/var/log/auth.log", text: "" }] })).toMatchObject({ ok: false, error: expect.stringContaining("already passes") });
    expect(validateTerminalLab({ ...t, files: [{ path: "relative.txt", content: "" }] })).toMatchObject({ ok: false });
  });
});
