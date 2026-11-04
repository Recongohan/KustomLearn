import { describe, it, expect } from "vitest";
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
});
