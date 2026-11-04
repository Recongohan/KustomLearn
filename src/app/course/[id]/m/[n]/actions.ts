"use server";
import { z } from "zod";
import { checkAnswer, labHint, labSolution, labSubmit, submitQuiz } from "@/lib/player";
import { currentUserId } from "@/lib/settings";

const Where = z.object({ courseId: z.string().uuid(), position: z.number().int().min(0).max(64) });
const Choice = z.number().int().min(0).max(16);

export async function checkAction(courseId: string, position: number, question: number, choice: number) {
  const where = Where.safeParse({ courseId, position });
  const q = z.number().int().min(0).max(64).safeParse(question);
  const c = Choice.safeParse(choice);
  if (!where.success || !q.success || !c.success) return null;
  return checkAnswer(where.data.courseId, currentUserId(), where.data.position, q.data, c.data);
}

export async function submitAction(courseId: string, position: number, answers: number[]) {
  const where = Where.safeParse({ courseId, position });
  const a = z.array(Choice).max(64).safeParse(answers);
  if (!where.success || !a.success) return null;
  return submitQuiz(where.data.courseId, currentUserId(), where.data.position, a.data);
}

const Lab = Where.extend({ lab: z.number().int().min(0).max(16) });
// The rows a lab query returned in the browser: bounded so a huge result can't be posted.
const Rows = z.object({
  columns: z.array(z.string().max(200)).max(50),
  rows: z.array(z.array(z.string().max(2000).nullable()).max(50)).max(1000),
});

export async function labHintAction(courseId: string, position: number, lab: number) {
  const w = Lab.safeParse({ courseId, position, lab });
  return w.success ? labHint(w.data.courseId, currentUserId(), w.data.position, w.data.lab) : null;
}

export async function labSolutionAction(courseId: string, position: number, lab: number) {
  const w = Lab.safeParse({ courseId, position, lab });
  return w.success ? labSolution(w.data.courseId, currentUserId(), w.data.position, w.data.lab) : null;
}

export async function labSubmitAction(courseId: string, position: number, lab: number, result: unknown) {
  const w = Lab.safeParse({ courseId, position, lab });
  const r = Rows.safeParse(result);
  if (!w.success || !r.success) return null;
  return labSubmit(w.data.courseId, currentUserId(), w.data.position, w.data.lab, r.data);
}
