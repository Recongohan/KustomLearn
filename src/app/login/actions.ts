"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_TTL_S, checkPassword, clearFailures, issueSession, lockedFor, recordFailure, safeNext } from "@/lib/gate";

// The rightmost X-Forwarded-For entry is the one our own reverse proxy added. With no proxy in front the
// header is client-controlled, so the throttle is per claimed client there; serve behind a proxy when public.
async function clientId(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",").pop()?.trim() || h.get("x-real-ip") || "direct";
}

export async function loginAction(_prev: string | null, form: FormData): Promise<string | null> {
  const password = process.env.APP_PASSWORD;
  if (!password) redirect("/");

  const client = await clientId();
  const wait = lockedFor(client);
  if (wait) return `Too many wrong tries. Try again in ${Math.ceil(wait / 60)} min.`;

  if (!checkPassword(String(form.get("password") ?? ""), password)) {
    recordFailure(client);
    await new Promise((r) => setTimeout(r, 1000)); // slows down guessing
    return "Wrong password.";
  }
  clearFailures(client);

  (await cookies()).set(SESSION_COOKIE, issueSession(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.APP_INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
  redirect(safeNext(String(form.get("next") ?? "/")));
}
