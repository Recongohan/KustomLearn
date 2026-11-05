// Optional shared-password gate for installs reachable by other people (set APP_PASSWORD).
// Runs in the proxy (Node.js runtime) and in the login server action.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { deriveKey } from "./crypto";

export const SESSION_COOKIE = "kl_session";
export const SESSION_TTL_S = 60 * 60 * 24 * 30;

// Sessions are signed with a key derived from the app secret and the password:
// a stolen cookie can't be used to guess the password offline, and changing APP_PASSWORD signs everyone out.
function sign(password: string, payload: string): string {
  return createHmac("sha256", deriveKey(`session:v1:${password}`)).update(payload).digest("base64url");
}

/** A signed token "v1.<expiry seconds>.<signature>". */
export function issueSession(password: string, now = Date.now()): string {
  const payload = `v1.${Math.floor(now / 1000) + SESSION_TTL_S}`;
  return `${payload}.${sign(password, payload)}`;
}

export function verifySession(token: string, password: string, now = Date.now()): boolean {
  const m = /^v1\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m || Number(m[1]) * 1000 <= now) return false;
  return safeEqual(m[2], sign(password, `v1.${m[1]}`));
}

/** Hashing both sides first makes the comparison constant-time whatever the lengths. */
export function checkPassword(attempt: string, password: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(attempt), h(password));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Where to go after login: a same-origin path and query only, "/" for anything else. */
export function safeNext(raw: string): string {
  // Backslashes, whitespace and control characters are normalised away by URL parsers and browsers; refuse them outright.
  if (!raw.startsWith("/") || /[\\\s\x00-\x1f\x7f]/.test(raw)) return "/";
  const base = "http://kustomlearn.invalid";
  try {
    const url = new URL(raw, base);
    if (url.origin !== base || url.pathname.startsWith("//")) return "/";
    return url.pathname + url.search;
  } catch {
    return "/";
  }
}

// Login throttle: MAX_FAILS wrong passwords within a window lock that client out for a full window.
// In memory, so it holds for one server process. Several instances would each count separately and need a shared store.
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60_000;
const fails = new Map<string, { count: number; reset: number }>();

/** Seconds until this client may try again, or 0. */
export function lockedFor(client: string, now = Date.now()): number {
  const entry = fails.get(client);
  if (!entry) return 0;
  if (now >= entry.reset) {
    fails.delete(client);
    return 0;
  }
  return entry.count >= MAX_FAILS ? Math.ceil((entry.reset - now) / 1000) : 0;
}

export function recordFailure(client: string, now = Date.now()): void {
  if (fails.size > 10_000) for (const [k, v] of fails) if (now >= v.reset) fails.delete(k);
  const entry = fails.get(client);
  if (!entry || now >= entry.reset) fails.set(client, { count: 1, reset: now + WINDOW_MS });
  else if (++entry.count >= MAX_FAILS) entry.reset = now + WINDOW_MS; // the lockout runs a full window from the last failure
}

export function clearFailures(client: string): void {
  fails.delete(client);
}
