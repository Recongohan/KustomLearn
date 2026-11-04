"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/gate";

export async function loginAction(_prev: string | null, form: FormData): Promise<string | null> {
  const password = process.env.APP_PASSWORD;
  if (!password) redirect("/");

  const attempt = String(form.get("password") ?? "");
  const expected = await sessionToken(password);
  if (!safeEqual(await sessionToken(attempt), expected)) {
    await new Promise((r) => setTimeout(r, 1000)); // slows down guessing
    return "Wrong password.";
  }

  (await cookies()).set(SESSION_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.APP_INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/"); // same-site paths only
}
