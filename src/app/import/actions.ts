"use server";
import { cookies } from "next/headers";
import { importCourse, MAX_BUNDLE } from "@/lib/bundle";
import { TZ_COOKIE } from "@/lib/gameplay";
import { currentUserId } from "@/lib/settings";

export async function importAction(raw: unknown) {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > MAX_BUNDLE) return { ok: false as const, error: "That file is too big for a course (10 MB at most)." };
  return importCourse(raw, currentUserId(), (await cookies()).get(TZ_COOKIE)?.value);
}
