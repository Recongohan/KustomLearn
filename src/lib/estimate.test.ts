import { describe, it, expect } from "vitest";
import { estimate } from "./estimate";
import { costMicros } from "./ai/pricing";
import { normalize } from "./ai/intake";
import { fakeIntake } from "./ai/fixtures";

describe("pricing", () => {
  it("prices Opus 5.5 at $4 in / $20 out per million", () => {
    expect(costMicros("claude-opus-5-5", 1_000_000, 1_000_000)).toBe(24_000_000);
  });
});

describe("estimate", () => {
  const v = { modules: 12, labs: { code: 3, terminal: 5, logs: 8 }, capstone: true };
  it("orders low < high < cap, with the cap at the mid estimate +30%", () => {
    const e = estimate(v, "claude-opus-5-5");
    expect(e.lowMicros).toBeLessThan(e.highMicros);
    expect(e.highMicros).toBeLessThan(e.capMicros);
    expect(e.capMicros / (e.lowMicros / 0.8)).toBeCloseTo(1.3, 2);
  });
  it("grows with labs and drops with a cheaper model", () => {
    const more = estimate({ ...v, labs: { code: 10, terminal: 10, logs: 10 } }, "claude-opus-5-5");
    expect(more.capMicros).toBeGreaterThan(estimate(v, "claude-opus-5-5").capMicros);
    expect(estimate(v, "claude-haiku-5-5").capMicros).toBeLessThan(estimate(v, "claude-opus-5-5").capMicros);
  });
});

describe("normalize", () => {
  it("clamps out-of-range model output and keeps 3 variations", () => {
    const raw = fakeIntake("soc");
    raw.variations.push({ ...raw.variations[0] });
    raw.variations[0] = { ...raw.variations[0], weeks: 40, modules: 1, labs: { code: -2, terminal: 99, logs: 3 } };
    const n = normalize(raw);
    expect(n.variations).toHaveLength(3);
    expect(n.variations[0]).toMatchObject({ weeks: 12, modules: 3, labs: { code: 0, terminal: 30, logs: 3 } });
  });
});
