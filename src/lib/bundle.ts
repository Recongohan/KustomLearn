import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { Outline } from "./ai/generate";
import { Variation } from "./ai/intake";
import { localDay } from "./game";
import { CodeLab, LogsLab, TerminalLab } from "./labs/types";
import { validateTerminalLab } from "./labs/validate";
import { scheduleDates } from "./schedule";

// A .kustom file: one finished course as JSON, with no learner data, keys or costs, so it can be shared and
// played anywhere without an API key. Imports are untrusted: everything is checked by shape and size here,
// lessons render without raw HTML, and lab code only ever runs in the importer's own browser.

export const MAX_BUNDLE = 10_000_000; // bytes

const text = (max: number) => z.string().max(max);
const ResultSet = z.object({ columns: z.array(text(200)).max(50), rows: z.array(z.array(text(2000).nullable()).max(50)).max(500) });
const Lab = z.discriminatedUnion("kind", [
  LogsLab.extend({ kind: z.literal("logs"), expected: ResultSet }),
  CodeLab.extend({ kind: z.literal("code"), expected: z.array(text(20_000)).max(12) }),
  TerminalLab.extend({ kind: z.literal("terminal") }),
]);
const Content = z.object({
  sections: z.array(z.object({ heading: text(300), markdown: text(100_000) })).max(20),
  diagram: text(20_000),
  quiz: z.array(z.object({ question: text(2000), choices: z.array(text(1000)).min(2).max(8), answer: z.number().int().min(0), explanation: text(4000) }).refine((q) => q.answer < q.choices.length, "answer out of range")).max(20),
  labs: z.array(Lab).max(12).optional(),
});

export const Bundle = z.object({
  format: z.literal("kustomlearn"),
  version: z.literal(1),
  course: z.object({ title: text(300), request: text(4000), intent: text(1000), category: text(200), variation: Variation, plan: Outline }),
  modules: z.array(z.object({ title: text(300), content: Content })).min(1).max(64),
});
export type Bundle = z.infer<typeof Bundle>;

/** The course as a .kustom bundle, or null if it isn't the user's or isn't finished. */
export async function exportCourse(courseId: string, userId: string): Promise<Bundle | null> {
  const db = await getDb();
  const [course] = await db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.id, courseId), eq(schema.courses.userId, userId), eq(schema.courses.status, "ready")));
  if (!course) return null;
  const mods = await db.select().from(schema.modules).where(eq(schema.modules.courseId, courseId)).orderBy(asc(schema.modules.position));
  return {
    format: "kustomlearn",
    version: 1,
    course: { title: course.title, request: course.request, intent: course.intent, category: course.category, variation: course.variation as Variation, plan: course.plan as Outline },
    modules: mods.map((m) => ({ title: m.title, content: m.content as Bundle["modules"][number]["content"] })),
  };
}

/** A code lab needs one expected value per test, and each test's arguments as a JSON array, or it can never be cleared. */
function codeLabFits(lab: Extract<Bundle["modules"][number]["content"]["labs"], unknown[]>[number] & { kind: "code" }) {
  if (lab.tests.length === 0 || lab.expected.length !== lab.tests.length) return false;
  return lab.tests.every((t) => {
    try {
      return Array.isArray(JSON.parse(t.args));
    } catch {
      return false;
    }
  });
}

/** Adds a bundle as a new ready course, scheduled from today. Returns its id, or why the file can't be used. */
export async function importCourse(raw: string, userId: string, tz?: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (Buffer.byteLength(raw, "utf8") > MAX_BUNDLE) return { ok: false, error: "That file is too big for a course (10 MB at most)." };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That isn't a .kustom file: it isn't valid JSON." };
  }
  const parsed = Bundle.safeParse(json);
  if (!parsed.success) return { ok: false, error: "That file isn't a KustomLearn course, or it's from a newer version." };
  const b = parsed.data;
  const v = b.course.variation;
  if (b.modules.length !== b.course.plan.modules.length || v.modules !== b.modules.length) return { ok: false, error: "That course is incomplete: its plan and levels don't match." };
  // The numbers drive the schedule and branch estimates, so keep them in the range the app itself creates.
  const inRange = (n: number, lo: number, hi: number) => n >= lo && n <= hi;
  if (!inRange(v.weeks, 1, 104) || !inRange(v.hoursPerWeek, 1, 80) || ![v.labs.code, v.labs.terminal, v.labs.logs].every((n) => inRange(n, 0, 64))) return { ok: false, error: "That course has settings this app can't use." };
  // Terminal labs are graded by replaying commands here, so make sure each one still holds together.
  for (const m of b.modules) for (const lab of m.content.labs ?? []) if (lab.kind === "terminal" ? !validateTerminalLab(lab).ok : lab.kind === "code" && !codeLabFits(lab)) return { ok: false, error: `The lab "${lab.title.slice(0, 80)}" is broken.` };

  const db = await getDb();
  const dates = scheduleDates(localDay(new Date(), tz), b.course.variation.weeks, b.modules.length);
  const id = await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(schema.courses)
      .values({ userId, ...b.course, status: "ready", budgetCapTokens: 0 })
      .returning({ id: schema.courses.id });
    await tx.insert(schema.modules).values(b.modules.map((m, i) => ({ courseId: c.id, position: i, title: m.title, content: m.content, scheduledOn: dates[i] })));
    return c.id;
  });
  return { ok: true, id };
}
