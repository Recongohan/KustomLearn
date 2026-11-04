"use client";
import { use, useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next: Promise<string> }) {
  const [error, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-3xl border border-line bg-panel p-5">
      <input type="hidden" name="next" value={use(next)} />
      <label htmlFor="password" className="font-semibold">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required aria-describedby={error ? "login-error" : undefined} className="h-12 rounded-xl border border-line bg-panel-2 px-4 outline-none focus:border-blue" />
      {error && <p id="login-error" role="alert" className="font-semibold text-pink-ink">{error}</p>}
      <button type="submit" disabled={pending} className="h-12 rounded-2xl bg-text font-bold text-bg disabled:opacity-60">
        {pending ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}
