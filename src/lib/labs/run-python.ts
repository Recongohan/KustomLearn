import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { PY_HARNESS } from "./harness";
import type { CodeOutcome } from "./types";

const TIMEOUT_MS = 30_000; // includes about 2 s to start Python

// The child process that runs model-written Python. Node's permission model blocks file writes, reads outside
// Pyodide's own files, subprocesses, workers and native addons; the socket APIs are replaced so nothing can
// connect out; it gets an empty environment, so no keys or secrets; and it is killed after TIMEOUT_MS.
const RUNNER = `
import { constants } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
const require = createRequire(import.meta.url);
process.binding = (name) => { if (name === "constants") return { fs: constants }; throw new Error("blocked"); };
const deny = () => { throw new Error("network is disabled in labs"); };
const net = require("node:net"), dgram = require("node:dgram"), dns = require("node:dns");
net.Socket.prototype.connect = deny; net.connect = net.createConnection = deny; net.Server.prototype.listen = deny;
dgram.Socket.prototype.send = deny; dgram.Socket.prototype.bind = deny; dgram.createSocket = deny;
for (const k of Object.keys(dns)) if (typeof dns[k] === "function") dns[k] = deny;
for (const k of Object.keys(dns.promises)) if (typeof dns.promises[k] === "function") dns.promises[k] = deny;
syncBuiltinESMExports();
for (const k of ["fetch", "WebSocket", "XMLHttpRequest", "EventSource"]) delete globalThis[k];
const input = JSON.parse(await new Promise((r) => { let s = ""; process.stdin.on("data", (d) => (s += d)); process.stdin.on("end", () => r(s)); }));
const { loadPyodide } = await import(new URL("file://" + process.env.PYODIDE_DIR + "/pyodide.mjs").href);
const py = await loadPyodide({ indexURL: process.env.PYODIDE_DIR + "/" });
const results = [];
for (const run of input.runs) {
  py.globals.set("__code", run.code); py.globals.set("__entry", input.entry); py.globals.set("__tests", input.tests);
  try { results.push(JSON.parse(py.runPython(input.harness))); } catch (e) { results.push({ error: String(e && e.message || e) }); }
}
process.stdout.write(JSON.stringify(results));
`;

export const pyodideDir = () => path.join(process.cwd(), "node_modules", "pyodide");

/** Runs each piece of code (e.g. the solution, then the starter) against the same tests, in one sandboxed child. */
export function runPython(codes: string[], entry: string, tests: string[]): Promise<({ results: CodeOutcome[]; stdout: string } | { error: string })[]> {
  const dir = pyodideDir();
  if (!existsSync(path.join(dir, "pyodide.mjs"))) return Promise.reject(new Error("Pyodide is not installed"));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--permission", `--allow-fs-read=${dir}`, "--max-old-space-size=512", "--input-type=module", "-e", RUNNER], {
      env: { PYODIDE_DIR: dir } as unknown as NodeJS.ProcessEnv, // nothing else: no API keys, no APP_SECRET, no NODE_OPTIONS
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "", err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d).length > 2_000_000 && child.kill("SIGKILL"));
    child.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
    child.on("error", (e) => (clearTimeout(timer), reject(e)));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (signal) return reject(new Error(`took longer than ${TIMEOUT_MS / 1000}s`));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error(`Python stopped (exit ${code}): ${err.split("\n").filter(Boolean).slice(-1)[0] ?? ""}`));
      }
    });
    child.stdin.end(JSON.stringify({ runs: codes.map((code) => ({ code })), entry, tests: JSON.stringify(tests.map((t) => JSON.parse(t))), harness: PY_HARNESS }));
  });
}
