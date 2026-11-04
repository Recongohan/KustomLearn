import { costMicros } from "./pricing";
import type { Intake } from "./intake";
import { GenerationError, type Outline } from "./generate";
import type { LogsLab } from "../labs/types";

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

export function fakeModule(title: string, maxTokens: number, labs = 0) {
  fakeLimit(maxTokens);
  return {
    data: {
      sections: [
        { heading: "Why it matters", markdown: `**${title}** shows up in almost every incident.` },
        { heading: "Try it", markdown: "```bash\ngrep 'Failed password' /var/log/auth.log | wc -l\n```" },
      ],
      diagram: "flowchart LR\n  A[Alert] --> B[Triage] --> C{Real?}\n  C -->|yes| D[Escalate]\n  C -->|no| E[Close]",
      quiz: [{ question: "Which Windows event ID is a failed logon?", choices: ["4624", "4625", "4688", "4720"], answer: 1, explanation: "4625 records a failed logon attempt." }],
      labs: Array.from({ length: labs }, () => ({ ...FAKE_LAB, solution: "select attacker_ip from auth_log" })), // broken until repaired
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

export function fakeRepair(lab: LogsLab, maxTokens: number) {
  fakeLimit(maxTokens);
  return { data: { ...lab, solution: FAKE_LAB.solution }, usage: FAKE_USAGE };
}
