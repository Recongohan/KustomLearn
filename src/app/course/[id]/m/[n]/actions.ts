"use server";
import { z } from "zod";
import { checkAnswer, submitQuiz } from "@/lib/player";
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
