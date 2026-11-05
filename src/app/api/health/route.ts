import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db";

export async function GET() {
  await connection();
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: process.env.DATABASE_URL ? "postgres" : "pglite" });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
