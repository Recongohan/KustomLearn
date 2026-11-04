"use client";
import { useEffect, useRef } from "react";

type Props = { open: boolean; reason: string; tokens: string; pending: boolean; onConfirm: () => void; onCancel: () => void };

/**
 * Asked before any AI call after a course is built: names the reason and the most it can spend on the
 * learner's key. A native modal dialog, so focus stays inside and Escape cancels.
 */
export function ConsentDialog({ open, reason, tokens, pending, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => (e.preventDefault(), onCancel())}
      aria-labelledby="consent-h"
      className="m-auto w-[min(92vw,440px)] rounded-3xl border border-line bg-panel p-6 text-text shadow-2xl backdrop:bg-black/60 open:animate-[kl-rise_0.3s_ease-out]"
    >
      <h2 id="consent-h" className="font-display text-2xl font-extrabold">Use AI for this?</h2>
      <p className="mt-2 text-muted">{reason}</p>
      <p className="mt-4 rounded-2xl bg-panel-2 p-4">
        It runs on your Anthropic key and can use up to <span className="font-bold tabular-nums">{tokens} tokens</span>. It stops there, and you only pay for what it uses.
      </p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={pending} className="h-12 rounded-2xl border border-line px-5 font-bold">Cancel</button>
        <button type="button" onClick={onConfirm} disabled={pending} autoFocus className="h-12 rounded-2xl bg-green px-5 font-bold text-[#06281a] shadow-[0_4px_0_#1a9a62] disabled:opacity-60">
          {pending ? "Starting…" : "Use AI"}
        </button>
      </div>
    </dialog>
  );
}
