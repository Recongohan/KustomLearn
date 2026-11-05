"use server";
import Anthropic from "@anthropic-ai/sdk";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { understand, IntakeError, Variation, type Intake } from "@/lib/ai/intake";
import { estimate } from "@/lib/estimate";
import { currentUserId, getApiKey, getSettings } from "@/lib/settings";

export type UnderstandState =
  | { ok: true; request: string; intake: Intake; tokens: number }
  | { ok: false; message: string };

const Request = z.string().trim().min(8, "Tell me a bit more, at least a few words.").max(2000, "Keep it under 2000 characters.");

export async function understandAction(raw: string): Promise<UnderstandState> {
  const parsed = Request.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const userId = currentUserId();
  const [apiKey, { model }] = await Promise.all([getApiKey(userId), getSettings(userId)]);
  if (!apiKey && process.env.KL_FAKE_AI !== "1") return { ok: false, message: "Add your Anthropic key in Settings first." };

  try {
    const { intake, inputTokens, outputTokens, costMicros } = await understand(parsed.data, { apiKey: apiKey ?? "", model });
    const db = await getDb();
    await db.insert(schema.aiCalls).values({ userId, reason: "Understand what you want to learn", model, inputTokens, outputTokens, costMicros });
    return { ok: true, request: parsed.data, intake, tokens: inputTokens + outputTokens };
  } catch (err) {
    if (err instanceof IntakeError) {
      if (err.usage) await (await getDb()).insert(schema.aiCalls).values({ userId, reason: "Understand what you want to learn (failed)", model, ...err.usage });
      return { ok: false, message: err.message };
    }
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, message: "Your Anthropic key was rejected. Update it in Settings." };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, message: "Anthropic is rate limiting this key. Wait a minute and try again." };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, message: "Couldn't reach Anthropic. Check your connection." };
    console.error("understand failed", err);
    return { ok: false, message: "Something went wrong. Try again." };
  }
}

const CreateInput = z.object({
  request: Request,
  intent: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  variation: Variation.extend({
    name: z.string().trim().min(1).max(60),
    pitch: z.string().trim().max(300),
    outcomes: z.array(z.string().trim().min(1).max(200)).min(1).max(3),
    weeks: z.number().int().min(1).max(12),
    hoursPerWeek: z.number().int().min(1).max(20),
    modules: z.number().int().min(3).max(16),
    labs: z.object({ code: z.number().int().min(0).max(30), terminal: z.number().int().min(0).max(30), logs: z.number().int().min(0).max(30) }),
  }),
});

export async function createCourseAction(input: z.input<typeof CreateInput>): Promise<{ ok: false; message: string }> {
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Those choices are out of range. Adjust and try again." };
  const { request, intent, category, variation } = parsed.data;

  const userId = currentUserId();
  const { model } = await getSettings(userId);
  const { capMicros, capTokens } = estimate(variation, model); // recomputed here; never trust a client-sent cost
  const db = await getDb();
  const [course] = await db
    .insert(schema.courses)
    .values({ userId, title: variation.name, request, intent, category, variation, budgetCapMicros: capMicros, budgetCapTokens: capTokens })
    .returning({ id: schema.courses.id });
  redirect(`/course/${course.id}`);
}
