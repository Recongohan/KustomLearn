import { describe, it, expect } from "vitest";

describe("settings", () => {
  process.env.PGLITE_DIR = "memory://";
  process.env.APP_SECRET = "test-secret";

  it("fails closed in hosted mode until sign-in exists", async () => {
    const { currentUserId } = await import("./settings");
    process.env.DATABASE_URL = "postgres://example";
    expect(() => currentUserId()).toThrow(/sign-in/);
    delete process.env.DATABASE_URL;
    expect(currentUserId()).toBe("local");
  });

  it("treats an undecryptable stored key as no key instead of crashing", async () => {
    const { getApiKey, saveSettings } = await import("./settings");
    const { getDb, schema } = await import("@/db");
    await saveSettings({ model: "claude-opus-5-5" });
    const db = await getDb();
    await db.update(schema.settings).set({ apiKeyEnc: "garbage.from.another-secret" });
    delete process.env.ANTHROPIC_API_KEY;
    await expect(getApiKey()).resolves.toBeUndefined();
  });
});
