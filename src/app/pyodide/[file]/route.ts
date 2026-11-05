import { readFile } from "node:fs/promises";
import path from "node:path";
import { pyodideDir } from "@/lib/labs/run-python";

// Serves Pyodide from the installed package, so Python labs work offline and nothing loads from a CDN.
const FILES: Record<string, string> = {
  "pyodide.mjs": "text/javascript",
  "pyodide.asm.mjs": "text/javascript",
  "pyodide.asm.wasm": "application/wasm",
  "python_stdlib.zip": "application/zip",
  "pyodide-lock.json": "application/json",
};

export async function GET(_req: Request, { params }: RouteContext<"/pyodide/[file]">) {
  const { file } = await params;
  const type = Object.hasOwn(FILES, file) ? FILES[file] : undefined;
  if (!type) return new Response("Not found", { status: 404 }); // an allowlist: no path ever reaches the file system
  const body = await readFile(path.join(pyodideDir(), file));
  return new Response(body, { headers: { "content-type": type, "cache-control": "public, max-age=86400" /* unversioned URLs: a pyodide upgrade must reach browsers within a day */ } });
}
