import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// AES-256-GCM for secrets at rest (the user's API key). Key = APP_SECRET, or a generated local secret file.
function key(): Buffer {
  let secret = process.env.APP_SECRET;
  if (!secret) {
    if (process.env.DATABASE_URL) throw new Error("APP_SECRET must be set when using a hosted database");
    const file = path.join(process.env.PGLITE_DIR && !process.env.PGLITE_DIR.startsWith("memory:") ? path.dirname(process.env.PGLITE_DIR) : path.join(process.cwd(), "data"), "app-secret");
    if (!existsSync(file)) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600 });
    }
    secret = readFileSync(file, "utf8");
  }
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(packed: string): string {
  const [iv, tag, data] = packed.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
