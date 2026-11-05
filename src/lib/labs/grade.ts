import { canonical } from "./harness";
import type { LabTest, ResultSet } from "./types";

/** One canonical text form per value, so the browser and the server compare the same thing. */
export function cell(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return String(Number(v.toFixed(6)));
  if (typeof v === "bigint" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return /^-?\d+(\.\d+)?$/.test(v) ? String(Number(Number(v).toFixed(6))) : v;
  return JSON.stringify(v);
}

export function toResultSet(fields: { name: string }[], rows: unknown[][]): ResultSet {
  return { columns: fields.map((f) => f.name), rows: rows.map((r) => r.map(cell)) };
}

const key = (row: (string | null)[]) => JSON.stringify(row);

/** Deterministic grading: the learner's rows against the reference rows. Order counts only when the task asks for it. */
export function gradeResult(expected: ResultSet, actual: ResultSet, ordered: boolean): LabTest[] {
  const cols = expected.columns.length === actual.columns.length;
  const count = expected.rows.length === actual.rows.length;
  let rows = cols && count;
  if (rows) {
    const a = actual.rows.map(key), e = expected.rows.map(key);
    rows = ordered ? a.every((r, i) => r === e[i]) : [...a].sort().join("\n") === [...e].sort().join("\n");
  }
  return [
    { name: `Returns ${expected.columns.length} column${expected.columns.length === 1 ? "" : "s"}`, pass: cols },
    { name: `Returns ${expected.rows.length} row${expected.rows.length === 1 ? "" : "s"}`, pass: count },
    { name: ordered ? "Rows match, in order" : "Rows match", pass: rows },
  ];
}

/** Code labs: each test passes when the function's return value equals the reference value (as canonical JSON). */
export function gradeCode(expected: string[], tests: { name: string }[], values: (string | null)[]): LabTest[] {
  return tests.map((t, i) => {
    let pass = false;
    try {
      pass = values[i] != null && canonical(values[i]!) === expected[i];
    } catch {}
    return { name: t.name, pass };
  });
}
