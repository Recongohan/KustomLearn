import { costMicros } from "./pricing";
import type { Intake } from "./intake";
import type { ModuleContent, Outline } from "./generate";

const FAKE_USAGE = { inputTokens: 5_000, outputTokens: 6_000, costMicros: costMicros("claude-opus-5-5", 5_000, 6_000) };

export function fakeOutline(modules: number): { data: Outline; usage: typeof FAKE_USAGE } {
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

export function fakeModule(title: string): { data: ModuleContent; usage: typeof FAKE_USAGE } {
  return {
    data: {
      sections: [
        { heading: "Why it matters", markdown: `**${title}** shows up in almost every incident.` },
        { heading: "Try it", markdown: "```bash\ngrep 'Failed password' /var/log/auth.log | wc -l\n```" },
      ],
      diagram: "flowchart LR\n  A[Alert] --> B[Triage] --> C{Real?}\n  C -->|yes| D[Escalate]\n  C -->|no| E[Close]",
      quiz: [{ question: "Which Windows event ID is a failed logon?", choices: ["4624", "4625", "4688", "4720"], answer: 1, explanation: "4625 records a failed logon attempt." }],
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
