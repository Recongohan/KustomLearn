import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto";

describe("crypto", () => {
  process.env.APP_SECRET = "test-secret";
  it("round-trips and hides the plaintext", () => {
    const packed = encrypt("sk-ant-example");
    expect(packed).not.toContain("sk-ant");
    expect(decrypt(packed)).toBe("sk-ant-example");
  });
  it("rejects tampered data", () => {
    const [iv, tag, data] = encrypt("secret").split(".");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decrypt([iv, tag, flipped.toString("base64")].join("."))).toThrow();
  });
});
