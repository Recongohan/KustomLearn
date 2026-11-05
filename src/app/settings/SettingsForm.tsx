"use client";
import { startTransition, useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { saveSettingsAction, type SaveState } from "./actions";

const LABELS: Record<string, string> = {
  "claude-opus-5-5": "Claude Opus 5.5 plans, Sonnet 5.5 writes · best courses",
  "claude-sonnet-5-5": "Claude Sonnet 5.5 · faster, cheaper",
  "claude-haiku-5-5": "Claude Haiku 5.5 · cheapest",
};

type Props = { models: string[]; model: string; keySource: "settings" | "env" | null };

export function SettingsForm({ models, model, keySource }: Props) {
  // Controlled fields: React resets uncontrolled ones after every action, which would wipe a mistyped key.
  const [apiKey, setApiKey] = useState("");
  const [selected, setSelected] = useState(model);
  const [stale, setStale] = useState(false);
  const [state, action, pending] = useActionState<SaveState, FormData>(async (prev, form) => {
    setStale(false);
    const result = await saveSettingsAction(prev, form);
    const submitted = form.get("apiKey");
    if (result?.ok) setApiKey((current) => (current === submitted ? "" : current)); // keep anything typed while it was checking
    return result;
  }, null);
  const [show, setShow] = useState(false);

  return (
    <form
      // onSubmit instead of `action`: a form action makes React reset the fields after every save.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex flex-col gap-5 rounded-3xl border border-line bg-panel p-5 md:p-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="apiKey" className="font-semibold">Anthropic API key</label>
        <div className="flex gap-2">
          <input
            id="apiKey"
            name="apiKey"
            type={show ? "text" : "password"}
            value={apiKey}
            onChange={(e) => (setApiKey(e.target.value), setStale(true))}
            autoComplete="off"
            spellCheck={false}
            placeholder={keySource === "settings" ? "A key is saved" : "sk-ant-…"}
            aria-describedby="apiKey-help"
            className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-panel-2 px-4 font-mono text-sm outline-none focus:border-blue"
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="h-12 rounded-xl border border-line px-4 text-sm font-medium" aria-pressed={show}>
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <p id="apiKey-help" className="text-sm text-muted">
          {keySource === "env" ? "Using ANTHROPIC_API_KEY from the environment. Paste one to override." : keySource ? "Leave empty to keep the saved key." : "Get one at console.anthropic.com. It's checked before saving."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="model" className="font-semibold">Model</label>
        <select id="model" name="model" disabled={pending} value={selected} onChange={(e) => (setSelected(e.target.value), setStale(true))} className="h-12 rounded-xl border border-line bg-panel-2 px-3 outline-none focus:border-blue">
          {models.map((m) => (
            <option key={m} value={m}>{LABELS[m] ?? m}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <motion.button
          type="submit"
          disabled={pending}
          whileTap={{ scale: 0.97 }}
          className="h-12 rounded-2xl bg-text px-6 font-bold text-bg disabled:opacity-60"
        >
          {pending ? "Checking…" : "Save"}
        </motion.button>
        <AnimatePresence mode="wait">
          {state && !stale && (
            <motion.p
              key={state.message}
              role="status"
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              className={state.ok ? "font-semibold text-green-ink" : "font-semibold text-pink-ink"}
            >
              {state.message}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
