import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export const LOCAL_USER_ID = "local";
const MIGRATIONS = path.join(process.cwd(), "drizzle");

type Db = Awaited<ReturnType<typeof connectPglite>>;

// Next bundles route handlers, server actions and pages separately, so a module-level variable would exist once
// per bundle. Two PGlite instances on one directory don't see each other's writes and can corrupt it: keep one per process.
const store = globalThis as typeof globalThis & { __kustomlearnDb?: Promise<Db> };

async function connectPglite(dataDir: string) {
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (!dataDir.startsWith("memory://")) mkdirSync(dataDir, { recursive: true });
  const db = drizzle({ connection: { dataDir }, schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function connectNeon(url: string) {
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  const db = drizzle(url, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  // Same query API as PGlite; the cast keeps one Db type for callers.
  return db as unknown as Db;
}

/** One shared connection. DATABASE_URL set → Neon/Postgres, otherwise embedded PGlite in PGLITE_DIR. */
export function getDb(): Promise<Db> {
  store.__kustomlearnDb ??= (
    process.env.DATABASE_URL
      ? connectNeon(process.env.DATABASE_URL)
      : connectPglite(process.env.PGLITE_DIR || path.join(process.cwd(), "data", "pglite")) // ||: an empty value from .env means unset
  ).catch((err) => {
    store.__kustomlearnDb = undefined; // let the next request retry instead of caching the failure
    throw err;
  });
  return store.__kustomlearnDb;
}

export { schema };
