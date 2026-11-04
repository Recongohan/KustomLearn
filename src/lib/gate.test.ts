import { describe, it, expect } from "vitest";
import { safeEqual, sessionToken } from "./gate";

describe("password gate", () => {
  it("derives a stable token per password and a different one for another password", async () => {
    const a = await sessionToken("correct horse");
    expect(a).toHaveLength(64);
    expect(await sessionToken("correct horse")).toBe(a);
    expect(await sessionToken("wrong horse")).not.toBe(a);
  });
  it("compares safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
