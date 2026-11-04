import "server-only";
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { getDb, schema, LOCAL_USER_ID } from "@/db";
import { decrypt, encrypt } from "./crypto";

export const MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type Model = (typeof MODELS)[number];

// shortcut: single local user, swap for the Clerk user id in milestone 8.
export const currentUserId = () => LOCAL_USER_ID;

export async function getSettings(userId = currentUserId()) {
  await connection(); // per-user data: always read at request time
  const db = await getDb();
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId));
  const key = row?.apiKeyEnc ? decrypt(row.apiKeyEnc) : process.env.ANTHROPIC_API_KEY;
  return {
    model: (row?.model ?? MODELS[0]) as Model,
    hasKey: Boolean(key),
    keyHint: key ? `••••${key.slice(-4)}` : null,
    keySource: row?.apiKeyEnc ? ("settings" as const) : key ? ("env" as const) : null,
  };
}

/** Server-only: the decrypted key for API calls. Never send this to the client. */
export async function getApiKey(userId = currentUserId()): Promise<string | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId));
  return row?.apiKeyEnc ? decrypt(row.apiKeyEnc) : process.env.ANTHROPIC_API_KEY;
}

export async function saveSettings(values: { apiKey?: string; model: Model }, userId = currentUserId()) {
  const db = await getDb();
  const apiKeyEnc = values.apiKey ? encrypt(values.apiKey) : undefined;
  await db
    .insert(schema.settings)
    .values({ userId, model: values.model, apiKeyEnc })
    .onConflictDoUpdate({
      target: schema.settings.userId,
      set: { model: values.model, updatedAt: new Date(), ...(apiKeyEnc ? { apiKeyEnc } : {}) },
    });
}
