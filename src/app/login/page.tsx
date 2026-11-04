import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">This KustomLearn is private</h1>
      <Suspense>
        <LoginForm next={searchParams.then((p) => (typeof p.next === "string" ? p.next : "/"))} />
      </Suspense>
    </div>
  );
}
