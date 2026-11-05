import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Diagram } from "@/components/player/Diagram";
import { CodeLab } from "@/components/player/CodeLab";
import { LogLab } from "@/components/player/LogLab";
import { Markdown } from "@/components/player/Markdown";
import { Quiz } from "@/components/player/Quiz";
import { TerminalLab } from "@/components/player/TerminalLab";
import { StudyTimer } from "@/components/game/StudyTimer";
import { playModule } from "@/lib/player";
import { currentUserId } from "@/lib/settings";

async function Module({ params }: { params: Promise<{ id: string; n: string }> }) {
  await connection();
  const { id, n } = await params;
  const position = Number(n) - 1;
  if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isInteger(position) || position < 0) notFound();
  const m = await playModule(id, currentUserId(), position);
  if (!m) redirect(`/course/${id}`); // missing, not ready or still locked: back to the map

  return (
    <article className="flex flex-col gap-8">
      <StudyTimer />
      <header className="flex flex-col gap-3">
        <Link href={`/course/${id}`} className="flex h-11 w-fit items-center gap-2 rounded-xl pr-3 font-medium text-muted hover:text-text">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          World map
        </Link>
        <p className="text-sm font-semibold text-blue-ink">Level {position + 1} of {m.total}</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">{m.title}</h1>
      </header>

      {m.sections.map((s, i) => (
        <section key={i} aria-labelledby={`s-${i}`} className="kl-in flex flex-col gap-3" style={{ animationDelay: `${Math.min(i, 6) * 70}ms` }}>
          <h2 id={`s-${i}`} className="font-display text-2xl font-extrabold">{s.heading}</h2>
          <Markdown>{s.markdown}</Markdown>
          {i === 0 && m.diagram && <Diagram source={m.diagram} title={m.title} />}
        </section>
      ))}

      {m.labs.map((lab, k) =>
        lab.kind === "logs" ? (
          <LogLab key={k} courseId={id} position={position} index={k} lab={lab} />
        ) : lab.kind === "code" ? (
          <CodeLab key={k} courseId={id} position={position} index={k} lab={lab} />
        ) : (
          <TerminalLab key={k} courseId={id} position={position} index={k} lab={lab} />
        ),
      )}

      <Quiz courseId={id} position={position} questions={m.quiz} best={m.best.stars} />
    </article>
  );
}

export default function ModulePage({ params }: PageProps<"/course/[id]/m/[n]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-panel" />}>
        <Module params={params} />
      </Suspense>
    </div>
  );
}
