"use server";
import { z } from "zod";
import { claimChest, claimQuest, studyBeat } from "@/lib/gameplay";
import { QUESTS } from "@/lib/game";
import { currentUserId } from "@/lib/settings";

const QuestId = z.enum(QUESTS.map((q) => q.id) as [string, ...string[]]);

export async function claimQuestAction(id: string) {
  const q = QuestId.safeParse(id);
  return q.success ? claimQuest(currentUserId(), q.data) : null;
}

export async function claimChestAction() {
  return claimChest(currentUserId());
}

export async function studyBeatAction() {
  return studyBeat(currentUserId());
}
