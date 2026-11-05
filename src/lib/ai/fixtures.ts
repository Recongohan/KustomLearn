import type { Intake } from "./intake";

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
