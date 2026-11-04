import "server-only";
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { getDb, schema, LOCAL_USER_ID } from "@/db";
import { decrypt, encrypt } from "./crypto";

export const MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type Model = (typeof MODELS)[number];

/**
 * The signed-in user. Locally that's the single implicit user.
 * shortcut: hosted mode (DATABASE_URL) has no sign-in until Clerk lands in milestone 8, so it fails closed
 * instead of letting every visitor share one account.
 */
export function currentUserId(): string {
  if (process.env.DATABASE_URL) throw new Error("Hosted mode needs sign-in, which arrives with cloud mode. Run without DATABASE_URL for now.");
  return LOCAL_USER_ID;
}

async function readRow(userId: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.userId, userId));
  let savedKey: string | undefined;
  try {
    savedKey = row?.apiKeyEnc ? decrypt(row.apiKeyEnc) : undefined;
  } catch {
    // Changed APP_SECRET or lost secret file: treat as no saved key so the user can paste a new one.
    console.error("Stored API key could not be decrypted. Check APP_SECRET.");
  }
  return { row, savedKey };
}

export async function getSettings(userId = currentUserId()) {
  await connection(); // per-user data: always read at request time
  const { row, savedKey } = await readRow(userId);
  const key = savedKey ?? process.env.ANTHROPIC_API_KEY;
  return {
    model: (row?.model ?? MODELS[0]) as Model,
    hasKey: Boolean(key),
    keyHint: key ? `••••${key.slice(-4)}` : null,
    keySource: savedKey ? ("settings" as const) : key ? ("env" as const) : null,
  };
}

/** Server-only: the decrypted key for API calls. Never send this to the client. */
export async function getApiKey(userId = currentUserId()): Promise<string | undefined> {
  const { savedKey } = await readRow(userId);
  return savedKey ?? process.env.ANTHROPIC_API_KEY;
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
