"use server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { MODELS, saveSettings } from "@/lib/settings";

const Input = z.object({
  apiKey: z.string().trim().max(300).optional().transform((v) => v || undefined),
  model: z.enum(MODELS),
});

export type SaveState = { ok: boolean; message: string } | null;

export async function saveSettingsAction(_prev: SaveState, form: FormData): Promise<SaveState> {
  const parsed = Input.safeParse({ apiKey: form.get("apiKey") ?? undefined, model: form.get("model") });
  if (!parsed.success) return { ok: false, message: "That doesn't look right. Check the key and model." };
  const { apiKey, model } = parsed.data;

  if (apiKey) {
    // Free check that the key works and can use the chosen model.
    try {
      await new Anthropic({ apiKey, maxRetries: 1, timeout: 15_000 }).models.retrieve(model);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) return { ok: false, message: "Anthropic rejected that key." };
      if (err instanceof Anthropic.NotFoundError) return { ok: false, message: "This key can't use that model." };
      if (err instanceof Anthropic.APIConnectionError) return { ok: false, message: "Couldn't reach Anthropic. Check your connection." };
      return { ok: false, message: "Couldn't verify the key right now. Try again." };
    }
  }

  await saveSettings({ apiKey, model });
  revalidatePath("/", "layout");
  return { ok: true, message: apiKey ? "Key verified and saved" : "Saved" };
}
