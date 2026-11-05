import { ImportCourse } from "./ImportCourse";

export default function ImportPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <header className="kl-in">
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Import a course</h1>
        <p className="mt-1.5 text-muted">Open a course someone shared with you as a .kustom file. It starts fresh with your own progress, and plays without an API key.</p>
      </header>
      <ImportCourse />
    </div>
  );
}
