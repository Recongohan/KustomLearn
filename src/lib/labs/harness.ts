// Runs a code lab's function against its tests. The same harness runs on the server (to validate the reference
// solution) and in the browser (the learner's code), so both sides produce identical canonical values.
import type { QuickJSWASMModule } from "quickjs-emscripten-core";
import type { CodeOutcome } from "./types";

export const IDENT = /^[A-Za-z_$][\w$]*$/;
const MAX_OUT = 20_000; // characters of a return value or of printed output

/** JSON with sorted keys, so {a,b} and {b,a} compare equal. */
export function canonical(json: string): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sort(JSON.parse(json)));
}

/** Python side. Reads __code, __entry and __tests (JSON) from globals; returns JSON of outcomes and printed output. */
export const PY_HARNESS = `
import json, sys, io
def __run():
    out = io.StringIO()
    sys.stdout = out
    results = []
    ns = {"__name__": "__lab__"}
    try:
        exec(__code, ns)
        fn = ns.get(__entry)
        if not callable(fn):
            raise NameError("define a function named " + __entry)
    except BaseException as e:
        sys.stdout = sys.__stdout__
        return json.dumps({"results": [{"value": None, "error": type(e).__name__ + ": " + str(e)} for _ in json.loads(__tests)], "stdout": out.getvalue()[:${MAX_OUT}]})
    for args in json.loads(__tests):
        try:
            v = json.dumps(fn(*args), sort_keys=True, separators=(",", ":"))
            results.append({"value": v[:${MAX_OUT}], "error": None})
        except BaseException as e:
            results.append({"value": None, "error": type(e).__name__ + ": " + str(e)})
    sys.stdout = sys.__stdout__
    return json.dumps({"results": results, "stdout": out.getvalue()[:${MAX_OUT}]})
__run()
`;

/** JavaScript side, in QuickJS: no host access, a memory cap, and a deadline per call. */
export function runJs(QuickJS: QuickJSWASMModule, code: string, entry: string, tests: string[], ms = 2000): { results: CodeOutcome[]; stdout: string } {
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(64 * 1024 * 1024);
  runtime.setMaxStackSize(1024 * 1024);
  const vm = runtime.newContext();
  let stdout = "";
  const log = vm.newFunction("log", (...args) => {
    stdout = (stdout + args.map((a) => String(vm.dump(a))).join(" ") + "\n").slice(0, MAX_OUT);
  });
  const consoleObj = vm.newObject();
  vm.setProp(consoleObj, "log", log);
  vm.setProp(vm.global, "console", consoleObj);
  consoleObj.dispose();
  log.dispose();

  const evalWithin = (src: string) => {
    const deadline = Date.now() + ms;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    const r = vm.evalCode(src);
    if (r.error) {
      const e = vm.dump(r.error);
      r.error.dispose();
      return { error: typeof e === "object" && e ? `${e.name ?? "Error"}: ${e.message ?? ""}` : String(e) };
    }
    const v = vm.dump(r.value);
    r.value.dispose();
    return { value: v };
  };

  let results: CodeOutcome[];
  const loaded = evalWithin(`${code}\n;typeof ${entry} === "function"`);
  if ("error" in loaded || !loaded.value) {
    const error = ("error" in loaded ? loaded.error : undefined) ?? `define a function named ${entry}`;
    results = tests.map(() => ({ value: null, error }));
  } else {
    let stopped: string | null = null;
    results = tests.map((args) => {
      if (stopped) return { value: null, error: stopped }; // one call ran out of time: don't wait out the rest
      const r = evalWithin(`JSON.stringify(${entry}(...${args}) ?? null)`);
      if ("error" in r && /interrupted/i.test(r.error ?? "")) stopped = `Stopped after ${ms / 1000} seconds. Is there a loop that never ends?`;
      if ("error" in r) return { value: null, error: stopped ?? r.error ?? "Error" };
      return { value: typeof r.value === "string" ? canonical(r.value).slice(0, MAX_OUT) : "null", error: null };
    });
  }
  vm.dispose();
  runtime.dispose();
  return { results, stdout };
}
