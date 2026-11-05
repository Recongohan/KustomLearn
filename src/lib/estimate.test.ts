import { describe, it, expect } from "vitest";
import { estimate, formatTokens } from "./estimate";

describe("tokens", () => {
  it("formats like the UI shows them", () => {
    expect([formatTokens(950), formatTokens(212_400), formatTokens(1_000_000), formatTokens(1_250_000)]).toEqual(["950", "212K", "1M", "1.3M"]);
  });
  it("token range is the same whatever the model", () => {
    const v = { modules: 6, labs: { code: 1, terminal: 3, logs: 4 }, capstone: false };
    expect(estimate(v, "claude-haiku-5-5").capTokens).toBe(estimate(v, "claude-opus-5-5").capTokens);
  });
});
import { billedUsage, costMicros } from "./ai/pricing";
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
  it("trims text to the limits the create action accepts", () => {
    const raw = fakeIntake("soc");
    raw.category = " " + "c".repeat(200);
    raw.variations[0] = { ...raw.variations[0], name: "n".repeat(100), pitch: "p".repeat(500), outcomes: ["a", "b", "c", "o".repeat(300)] };
    const n = normalize(raw);
    expect(n.category).toHaveLength(80);
    expect(n.variations[0].name).toHaveLength(60);
    expect(n.variations[0].pitch).toHaveLength(300);
    expect(n.variations[0].outcomes).toEqual(["a", "b", "c"]);
  });
});

describe("billed usage", () => {
  it("uses top-level usage when there are no iterations", () => {
    expect(billedUsage({ input_tokens: 1000, output_tokens: 100 }, "claude-opus-5-5")).toEqual({ inputTokens: 1000, outputTokens: 100, costMicros: 6000 });
  });
  it("counts every fallback attempt at its own model's rate", () => {
    const usage = {
      input_tokens: 1000,
      output_tokens: 100,
      iterations: [
        { input_tokens: 1000, output_tokens: 20, model: "claude-opus-5-5" }, // declined mid-output
        { input_tokens: 1000, output_tokens: 100, model: "claude-opus-5" },
      ],
    };
    expect(billedUsage(usage, "claude-opus-5-5")).toEqual({ inputTokens: 2000, outputTokens: 120, costMicros: 4400 + 7500 });
  });
  it("prices an unknown model at the highest known rate", () => {
    expect(billedUsage({ input_tokens: 0, output_tokens: 0, iterations: [{ input_tokens: 1_000_000, output_tokens: 0, model: "claude-new" }] }, "claude-haiku-5-5").costMicros).toBe(5_000_000);
  });
});
