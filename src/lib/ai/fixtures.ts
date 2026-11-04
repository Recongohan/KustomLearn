import { costMicros } from "./pricing";
import type { Intake } from "./intake";
import { GenerationError, type Outline } from "./generate";
import type { CodeLab, LogsLab } from "../labs/types";
import type { LabCounts } from "./generate";

const FAKE_USAGE = { inputTokens: 5_000, outputTokens: 6_000, costMicros: costMicros("claude-opus-5-5", 5_000, 6_000) };

// A fake call needs 6K output tokens; with less room it is cut off like a real one, and still costs what it used.
function fakeLimit(maxTokens: number) {
  if (maxTokens >= FAKE_USAGE.outputTokens) return;
  const usage = { inputTokens: 5_000, outputTokens: maxTokens, costMicros: costMicros("claude-opus-5-5", 5_000, maxTokens) };
  throw new GenerationError("A step came back incomplete.", usage, true);
}

export function fakeOutline(modules: number, maxTokens: number): { data: Outline; usage: typeof FAKE_USAGE } {
  fakeLimit(maxTokens);
  return {
    data: {
      title: "SOC Analyst from Zero",
      modules: Array.from({ length: modules }, (_, i) => ({
        title: `Module ${i + 1}: ${["Logs 101", "Windows events", "Brute force", "Lateral movement", "Detections", "Triage notes"][i % 6]}`,
        summary: "What it is, why analysts care, and how to spot it.",
        objectives: ["Explain the core idea", "Find it in real logs"],
      })),
    },
    usage: FAKE_USAGE,
  };
}

export function fakeModule(title: string, maxTokens: number, labs: LabCounts = { logs: 0, code: 0 }) {
  fakeLimit(maxTokens);
  return {
    data: {
      sections: [
        { heading: "Why it matters", markdown: `**${title}** shows up in almost every incident.` },
        { heading: "Try it", markdown: "```bash\ngrep 'Failed password' /var/log/auth.log | wc -l\n```" },
      ],
      diagram: "flowchart LR\n  A[Alert] --> B[Triage] --> C{Real?}\n  C -->|yes| D[Escalate]\n  C -->|no| E[Close]",
      quiz: [{ question: "Which Windows event ID is a failed logon?", choices: ["4624", "4625", "4688", "4720"], answer: 1, explanation: "4625 records a failed logon attempt." }],
      labs: Array.from({ length: labs.logs }, () => ({ ...FAKE_LAB, solution: "select attacker_ip from auth_log" })), // broken until repaired
      codeLabs: Array.from({ length: labs.code }, (_, i) => (i % 2 ? FAKE_JS_LAB : FAKE_PY_LAB)),
    },
    usage: FAKE_USAGE,
  };
}

/** Deterministic intake for tests and KL_FAKE_AI=1 (no API key, no cost). */
export function fakeIntake(request: string): Intake {
  return {
    inScope: true,
    outOfScopeReason: "",
    intent: `Get hands-on with ${request.slice(0, 40).trim()}`,
    category: "Cybersecurity / SOC",
    variations: [
      { name: "Fast track", pitch: "Triage real alerts within two weeks.", level: "beginner", weeks: 2, hoursPerWeek: 5, modules: 6, labs: { code: 1, terminal: 3, logs: 4 }, capstone: false, outcomes: ["Read Windows event logs", "Spot a brute-force attack", "Write a triage note"] },
      { name: "Deep dive", pitch: "Understand every layer from logs to detections.", level: "intermediate", weeks: 6, hoursPerWeek: 6, modules: 12, labs: { code: 3, terminal: 5, logs: 8 }, capstone: true, outcomes: ["Write detection rules", "Map attacks to MITRE ATT&CK", "Run an investigation end to end"] },
      { name: "Cert ready", pitch: "Cover the CySA+ objectives with labs for each.", level: "intermediate", weeks: 8, hoursPerWeek: 5, modules: 14, labs: { code: 2, terminal: 6, logs: 6 }, capstone: true, outcomes: ["Pass practice exams", "Explain each exam domain", "Handle incident scenarios"] },
    ],
  };
}

// A fake lab whose solution fails until it is "repaired", so tests and demos exercise the repair path too.
export const FAKE_LAB: LogsLab = {
  title: "Find the brute-force source",
  task: "The `auth_log` table holds SSH logins. Which source IPs failed to log in more than 5 times? Return `ip` and the number of failures.",
  setup: `create table auth_log (ts timestamptz not null, host text not null, username text not null, ip text not null, ok boolean not null);
insert into auth_log
select timestamptz '2026-11-01 08:00Z' + (n * interval '7 minutes'), 'web-0' || (n % 3), (array['amy','bob','cat','dev'])[1 + n % 4], '10.0.0.' || (1 + n % 9), n % 5 <> 0
from generate_series(1, 120) n;
insert into auth_log
select timestamptz '2026-11-02 03:00Z' + (n * interval '20 seconds'), 'web-01', 'root', '203.0.113.7', false
from generate_series(1, 14) n;`,
  starter: "select ip, ok\nfrom auth_log\nlimit 10",
  solution: "select ip, count(*) as failures from auth_log where not ok group by ip having count(*) > 5",
  walkthrough: "Keep only failed logins (`where not ok`), group them by `ip`, and keep the groups with more than 5 rows (`having count(*) > 5`). The attacker's IP stands out with 14 failures in under 5 minutes.",
  hints: ["Only the failed logins matter here.", "Group the failed rows by `ip` and count them.", "Filter groups with `having count(*) > 5`."],
  ordered: false,
};

export function fakeRepair<L extends LogsLab | CodeLab>(lab: L, maxTokens: number) {
  fakeLimit(maxTokens);
  return { data: { ...lab, solution: "entry" in lab ? lab.solution : FAKE_LAB.solution }, usage: FAKE_USAGE };
}

export const FAKE_PY_LAB: CodeLab = {
  title: "Count failures per user",
  task: "Write `failures_by_user(events)`. Each event is `{\"user\": str, \"ok\": bool}`. Return a dict from each user to how many of their events failed, leaving out users with none.\n\nExample: `[{\"user\": \"amy\", \"ok\": false}, {\"user\": \"bob\", \"ok\": true}]` gives `{\"amy\": 1}`.",
  language: "python",
  entry: "failures_by_user",
  starter: "def failures_by_user(events):\n    counts = {}\n    # your code here\n    return counts\n",
  solution: "def failures_by_user(events):\n    counts = {}\n    for e in events:\n        if not e['ok']:\n            counts[e['user']] = counts.get(e['user'], 0) + 1\n    return counts\n",
  walkthrough: "Walk the events once. For each failure, add one to that user's count, starting from 0 with `dict.get`. Users who never fail never get a key.",
  hints: ["Loop over the events and skip the successful ones.", "Keep a dict and add one for the user of each failure.", "`counts.get(user, 0) + 1` starts a new user at 1."],
  tests: [
    { name: "no events", args: "[[]]" },
    { name: "one failure", args: '[[{"user": "amy", "ok": false}, {"user": "bob", "ok": true}]]' },
    { name: "repeat offender", args: '[[{"user": "amy", "ok": false}, {"user": "amy", "ok": false}, {"user": "cat", "ok": false}]]' },
    { name: "all fine", args: '[[{"user": "amy", "ok": true}]]' },
  ],
};

export const FAKE_JS_LAB: CodeLab = {
  title: "Mask the IPs",
  task: "Write `maskIp(ip)`: keep the first two parts of an IPv4 address and replace the rest with `x`.\n\nExample: `maskIp(\"203.0.113.7\")` gives `\"203.0.x.x\"`.",
  language: "javascript",
  entry: "maskIp",
  starter: "function maskIp(ip) {\n  return ip;\n}\n",
  solution: "function maskIp(ip) {\n  const [a, b] = ip.split('.');\n  return `${a}.${b}.x.x`;\n}\n",
  walkthrough: "Split on dots, keep the first two parts, and join them with two `x` parts.",
  hints: ["`ip.split('.')` gives the four parts.", "You only need the first two.", "Build the string with a template literal."],
  tests: [
    { name: "public address", args: '["203.0.113.7"]' },
    { name: "private address", args: '["10.0.0.42"]' },
    { name: "loopback", args: '["127.0.0.1"]' },
  ],
};
