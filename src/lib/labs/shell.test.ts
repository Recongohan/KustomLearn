import { describe, it, expect } from "vitest";
import { createShell, exec, replay, runChecks } from "./shell";

const files = [
  { path: "/var/log/auth.log", content: "Nov 4 sshd: Failed password for root from 203.0.113.7\nNov 4 sshd: Accepted password for amy from 10.0.0.2\nNov 4 sshd: Failed password for admin from 203.0.113.7\nNov 4 sshd: Failed password for bob from 10.0.0.9\n" },
  { path: "/home/learner/notes.txt", content: "hello\n" },
];
const run = (lines: string[]) => {
  const sh = createShell(files);
  return { sh, results: lines.map((l) => exec(sh, l)) };
};

describe("shell simulator", () => {
  it("navigates and lists", () => {
    const { results, sh } = run(["pwd", "ls", "cd /var/log", "pwd", "ls -l", "cd ..", "pwd", "cd ~", "pwd", "cd nope"]);
    expect(results.map((r) => r.out)).toEqual(["/home/learner\n", "notes.txt\n", "", "/var/log\n", expect.stringContaining("auth.log"), "", "/var\n", "", "/home/learner\n", ""]);
    expect(results[9]).toMatchObject({ code: 1, err: expect.stringContaining("No such file") });
    expect(sh.cwd).toBe("/home/learner");
  });

  it("pipes, filters and counts like the real tools", () => {
    const { results } = run([
      "grep Failed /var/log/auth.log | wc -l",
      "grep -c Failed /var/log/auth.log",
      "grep -v Failed /var/log/auth.log",
      "grep Failed /var/log/auth.log | cut -d' ' -f9 | sort | uniq -c | sort -rn | head -1",
      "grep -o '203\\.[0-9.]*' /var/log/auth.log | sort -u",
      "tail -n 1 /var/log/auth.log",
      "head -2 /var/log/auth.log | wc -l",
    ]);
    expect(results.map((r) => r.out)).toEqual([
      "3\n",
      "3\n",
      "Nov 4 sshd: Accepted password for amy from 10.0.0.2\n",
      "      2 203.0.113.7\n",
      "203.0.113.7\n",
      "Nov 4 sshd: Failed password for bob from 10.0.0.9\n",
      "2\n",
    ]);
  });

  it("writes files with redirects, and manages files and folders", () => {
    const { sh, results } = run([
      "mkdir -p report/day1",
      "grep Failed /var/log/auth.log > report/day1/failed.txt",
      "echo done >> report/day1/failed.txt",
      "cp notes.txt report/",
      "mv report/notes.txt report/readme.txt",
      "touch empty.txt && rm empty.txt",
      "ls report",
      "chmod 700 report && ls -l",
      "cat report/*.txt",
    ]);
    expect(sh.fs.get("/home/learner/report/day1/failed.txt")).toMatchObject({ content: expect.stringMatching(/Failed[\s\S]*done\n$/) });
    expect(sh.fs.has("/home/learner/empty.txt")).toBe(false);
    expect(results[6].out).toBe("day1  readme.txt\n");
    expect(results[7].out).toContain("drwx------");
    expect(results[8].out).toBe("hello\n");
  });

  it("finds files, and handles errors and mistakes without crashing", () => {
    const { results, sh } = run(["find / -name '*.log'", "rm -rf /", "nmap 10.0.0.1", "echo 'unclosed", "cat /var/log", "ls | | wc", "cd /etc/passwd", "rm -r /var && ls /"]);
    expect(results[0].out).toBe("/var/log/auth.log\n");
    expect(results[1]).toMatchObject({ code: 1, err: expect.stringContaining("dangerous") });
    expect(results[2]).toMatchObject({ code: 127, err: "nmap: command not found\n" });
    expect(results[3].code).toBe(2);
    expect(results[4].err).toContain("Is a directory");
    expect(results[5].code).toBe(2);
    expect(results[7].out).not.toContain("var");
    expect(sh.fs.has("/var/log/auth.log")).toBe(false); // only the simulated tree changed
  });

  it("caps runaway output", () => {
    const sh = createShell([{ path: "/big.txt", content: "x".repeat(900_000) }]);
    const r = exec(sh, "cat /big.txt /big.txt");
    expect(r.out.length).toBeLessThan(110_000);
    expect(r.out).toContain("[output cut off]");
  });

  it("grades by replaying the session from the starting files", () => {
    const checks = [
      { name: "report exists", kind: "exists", path: "~/report/failed.txt", text: "" },
      { name: "has the attacker", kind: "contains", path: "~/report/failed.txt", text: "203.0.113.7" },
      { name: "no successful logins", kind: "lacks", path: "~/report/failed.txt", text: "Accepted" },
      { name: "back home", kind: "cwd", path: "", text: "~" },
    ];
    const good = replay(files, ["mkdir report", "cd report", "grep Failed /var/log/auth.log > failed.txt", "cd"]);
    expect(runChecks(good.sh, checks, good.lastOutput).every((c) => c.pass)).toBe(true);
    const bad = replay(files, ["mkdir report", "cat /var/log/auth.log > report/failed.txt"]);
    expect(runChecks(bad.sh, checks, bad.lastOutput).map((c) => c.pass)).toEqual([true, true, false, true]);
  });

  it("keeps hostile sessions bounded: no regex blowup, no runaway copies", () => {
    const sh = createShell([{ path: "/a.txt", content: "a".repeat(5_000) + "!\n" }]);
    const t = Date.now();
    expect(exec(sh, "grep -c '(a+)+$' /a.txt").out).toBe("0\n"); // hangs a backtracking engine
    expect(exec(sh, "grep -o 'a\\+!' /a.txt").code).toBe(1); // RE2 syntax, not BRE: \\+ is a literal plus
    exec(sh, `touch ${"a".repeat(1_500)}`);
    expect(exec(sh, "ls a*a*a*a*a*a*a*b").code).not.toBe(0); // a glob with no match stays as typed, without backtracking
    expect(exec(sh, "find . -name 'a*a*a*a*a*a*a*b'").out).toBe("");
    expect(Date.now() - t).toBeLessThan(1_000);
    expect(exec(sh, "echo 'x,y,z' | cut -d, -f 2-999999999").out).toBe("y,z\n"); // ranges are capped, not allocated
    expect(exec(sh, "echo 'x,y,z' | cut -d, -f 3-1").out).toBe("\n");
    expect(exec(sh, "echo 'x,y,z' | cut -d, -f 3,1-2,1-100,2").out).toBe("x,y,z\n"); // each field once, in order, like cut
    expect(exec(sh, `cat ${Array(500).fill("/a.txt").join(" ")}`).err).toContain("too large");
    exec(sh, "mkdir d && cat /a.txt /a.txt /a.txt /a.txt > d/f");
    const r = replay([{ path: "/home/learner/d/f", content: "x".repeat(400_000) }], Array(20).fill("cp -r d d2 && mv d2 d/sub"));
    let total = 0;
    for (const n of r.sh.fs.values()) if (n.type === "file") total += n.content.length;
    expect(total).toBeLessThanOrEqual(2_000_000);
  });
});
