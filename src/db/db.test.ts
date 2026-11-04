import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";

describe("db", () => {
  it("migrates PGlite and round-trips a row", async () => {
    process.env.PGLITE_DIR = "memory://";
    const { getDb, schema, LOCAL_USER_ID } = await import("./index");
    const db = await getDb();
    await db.insert(schema.gameState).values({ userId: LOCAL_USER_ID, xp: 25 });
    const [row] = await db.select().from(schema.gameState).where(eq(schema.gameState.userId, LOCAL_USER_ID));
    expect(row.xp).toBe(25);
    expect(row.freezes).toBe(1);
  });

  it("shares one connection across separately loaded copies of the module (Next bundles)", async () => {
    const a = await (await import("./index")).getDb();
    vi.resetModules();
    const b = await (await import("./index")).getDb();
    expect(b).toBe(a);
  });

  it("retries after a failed first connection instead of caching the failure", async () => {
    (globalThis as { __kustomlearnDb?: unknown }).__kustomlearnDb = undefined;
    const { getDb } = await import("./index");
    process.env.DATABASE_URL = "not-a-database-url";
    await expect(getDb()).rejects.toThrow();
    delete process.env.DATABASE_URL;
    process.env.PGLITE_DIR = "memory://";
    await expect(getDb()).resolves.toBeDefined();
  });
});
