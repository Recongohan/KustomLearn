"use client";
import { PY_HARNESS, runJs } from "./harness";
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";
import type { CodeOutcome } from "./types";

export type CodeRun = { results: CodeOutcome[]; stdout: string } | { error: string };

// Python runs in a Web Worker so an endless loop can be stopped by terminating it, not by freezing the tab.
const WORKER = `
let py;
self.onmessage = async (e) => {
  const { id, code, entry, tests, harness, base } = e.data;
  try {
    if (!py) { const { loadPyodide } = await import(base + "pyodide.mjs"); py = await loadPyodide({ indexURL: base }); }
    py.globals.set("__code", code); py.globals.set("__entry", entry); py.globals.set("__tests", tests);
    self.postMessage({ id, ok: true, data: JSON.parse(py.runPython(harness)) });
  } catch (err) { self.postMessage({ id, ok: false, error: String((err && err.message) || err) }); }
};`;

let quickjs: Promise<QuickJSWASMModule> | undefined;
const getQuickJS = () =>
  (quickjs ??= import("@jitl/quickjs-singlefile-browser-release-sync").then((v) => newQuickJSWASMModuleFromVariant(v.default)));

let worker: Worker | null = null;
let warm = false;
let seq = 0;

function pythonWorker() {
  worker ??= new Worker(URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" })), { type: "module" });
  return worker;
}

/** Starts downloading Python in the background, so the first Run is quick. */
export function preloadPython() {
  void runPython("def _warm():\n    return 1\n", "_warm", ["[]"]);
}

// One Python run at a time: the worker never loads Pyodide twice, and a timeout only ever stops its own run.
let queue: Promise<unknown> = Promise.resolve();
function runPython(code: string, entry: string, tests: string[]): Promise<CodeRun> {
  const run = queue.then(() => runPythonNow(code, entry, tests)).catch((e): CodeRun => ({ error: e instanceof Error ? e.message : String(e) })); // never rejects, so one failure can't jam the queue
  queue = run;
  return run;
}

function runPythonNow(code: string, entry: string, tests: string[]): Promise<CodeRun> {
  const w = pythonWorker();
  const id = ++seq;
  const ms = warm ? 10_000 : 90_000; // the first run also downloads Python (about 12 MB, then cached)
  return new Promise((resolve) => {
    const stop = setTimeout(() => {
      w.terminate();
      worker = null;
      warm = false;
      resolve({ error: `Stopped after ${ms / 1000} seconds. Is there a loop that never ends?` });
    }, ms);
    const onMessage = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      clearTimeout(stop);
      w.removeEventListener("message", onMessage);
      warm = true;
      resolve(e.data.ok ? e.data.data : { error: e.data.error });
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ id, code, entry, tests: JSON.stringify(tests.map((t) => JSON.parse(t))), harness: PY_HARNESS, base: `${location.origin}/pyodide/` });
  });
}

/** Runs the learner's function against every test in the lab's language. */
export async function runCodeLab(language: "python" | "javascript", code: string, entry: string, tests: string[]): Promise<CodeRun> {
  if (language === "python") return runPython(code, entry, tests);
  try {
    return runJs(await getQuickJS(), code, entry, tests);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
