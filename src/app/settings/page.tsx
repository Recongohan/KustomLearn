import { Suspense } from "react";
import { getSettings, MODELS } from "@/lib/settings";
import { SettingsForm } from "./SettingsForm";

async function Form() {
  const s = await getSettings();
  return <SettingsForm models={[...MODELS]} model={s.model} keySource={s.keySource} />;
}

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Settings</h1>
        <p className="mt-2 text-muted">Your key is encrypted before it is stored and never sent back to your browser. It is sent to Anthropic once to verify it when you save, and otherwise only used when you build a course.</p>
      </header>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-3xl bg-panel" />}>
        <Form />
      </Suspense>
    </div>
  );
}
