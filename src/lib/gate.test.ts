import { describe, it, expect } from "vitest";
import { SESSION_TTL_S, checkPassword, clearFailures, issueSession, lockedFor, recordFailure, safeEqual, safeNext, verifySession } from "./gate";

describe("password gate", () => {
  it("checks the password separately from the session", () => {
    expect(checkPassword("correct horse", "correct horse")).toBe(true);
    expect(checkPassword("wrong horse", "correct horse")).toBe(false);
    expect(checkPassword("", "correct horse")).toBe(false);
  });

  it("issues sessions that verify until they expire", () => {
    const now = Date.UTC(2026, 0, 1);
    const token = issueSession("pw", now);
    expect(verifySession(token, "pw", now)).toBe(true);
    expect(verifySession(token, "pw", now + (SESSION_TTL_S - 1) * 1000)).toBe(true);
    expect(verifySession(token, "pw", now + SESSION_TTL_S * 1000)).toBe(false);
  });

  it("rejects tampered tokens and tokens from another password", () => {
    const now = Date.now();
    const token = issueSession("pw", now);
    const [v, exp, sig] = token.split(".");
    expect(verifySession(`${v}.${Number(exp) + 999999}.${sig}`, "pw", now)).toBe(false);
    expect(verifySession(token, "new pw", now)).toBe(false);
    expect(verifySession("", "pw", now)).toBe(false);
    expect(verifySession("garbage", "pw", now)).toBe(false);
  });

  it("compares safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("only redirects to same-origin paths", () => {
    expect(safeNext("/course/1?tab=map")).toBe("/course/1?tab=map");
    expect(safeNext("/")).toBe("/");
    for (const bad of ["//evil.example", "/\\evil.example", "/\t/evil.example", "/.//evil.example", "/%2e//evil.example", "https://evil.example", "evil", "", "/\n/evil.example"]) {
      const out = safeNext(bad);
      expect(out.startsWith("//")).toBe(false);
      expect(new URL(out, "http://app.local").origin).toBe("http://app.local");
    }
    expect(safeNext("/.//evil.example")).toBe("/");
    expect(safeNext("/#frag")).toBe("/");
  });

  it("locks a client out after repeated failures", () => {
    const now = 1_000_000;
    for (let i = 0; i < 4; i++) recordFailure("1.2.3.4", now);
    expect(lockedFor("1.2.3.4", now)).toBe(0);
    recordFailure("1.2.3.4", now);
    expect(lockedFor("1.2.3.4", now)).toBeGreaterThan(0);
    expect(lockedFor("5.6.7.8", now)).toBe(0);
    recordFailure("1.2.3.4", now + 10 * 60_000); // a failure while locked restarts the full window
    expect(lockedFor("1.2.3.4", now + 15 * 60_000)).toBeGreaterThan(0);
    expect(lockedFor("1.2.3.4", now + 25 * 60_000)).toBe(0);
    recordFailure("9.9.9.9", now);
    clearFailures("9.9.9.9");
    expect(lockedFor("9.9.9.9", now)).toBe(0);
  });
});
