// A simulated Linux shell for terminal labs. Pure TypeScript over an in-memory file tree: no OS, no processes,
// no network. The same code runs in the browser (the learner's terminal) and on the server (validation and
// grading, by replaying the learner's commands), so both always agree.

import { RE2JS } from "re2js";

export type Node = { type: "dir"; mode: number } | { type: "file"; mode: number; content: string };
export type Shell = { fs: Map<string, Node>; cwd: string; home: string; user: string };
export type Result = { out: string; err: string; code: number };

export const HOME = "/home/learner";
const MAX_OUT = 100_000; // characters any one command may print
const MAX_FILES = 2_000;
const MAX_FILE = 1_000_000; // characters in one file
const MAX_TOTAL = 2_000_000; // characters across all files: the server replays sessions, so they must stay small

const totalSize = (sh: Shell) => {
  let n = 0;
  for (const node of sh.fs.values()) if (node.type === "file") n += node.content.length;
  return n;
};

export const COMMANDS = ["cat", "cd", "chmod", "clear", "cp", "cut", "echo", "find", "grep", "head", "help", "hostname", "ls", "mkdir", "mv", "pwd", "rm", "rmdir", "sort", "tail", "touch", "uniq", "wc", "whoami"] as const;

const parent = (p: string) => (p === "/" ? "/" : p.slice(0, p.lastIndexOf("/")) || "/");
const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);

export function resolve(sh: Shell, p: string): string {
  if (p === "~" || p.startsWith("~/")) p = sh.home + p.slice(1);
  const parts = (p.startsWith("/") ? p : `${sh.cwd}/${p}`).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}

/** A fresh shell with the lab's starting files (directories are created for every file's path). */
export function createShell(files: { path: string; content: string }[]): Shell {
  const sh: Shell = { fs: new Map([["/", { type: "dir", mode: 0o755 }]]), cwd: HOME, home: HOME, user: "learner" };
  const mkdirs = (dir: string) => {
    for (let d = dir; d !== "/" && !sh.fs.has(d); d = parent(d)) sh.fs.set(d, { type: "dir", mode: 0o755 });
  };
  mkdirs(HOME);
  mkdirs("/tmp");
  for (const f of files.slice(0, MAX_FILES)) {
    const path = resolve(sh, f.path);
    if (path === "/") continue;
    mkdirs(parent(path));
    sh.fs.set(path, { type: "file", mode: 0o644, content: f.content.slice(0, MAX_FILE) });
  }
  return sh;
}

const children = (sh: Shell, dir: string) => {
  const prefix = dir === "/" ? "/" : dir + "/";
  return [...sh.fs.keys()].filter((k) => k !== dir && k.startsWith(prefix) && !k.slice(prefix.length).includes("/")).sort();
};

// ---- parsing: quotes, pipes, redirects, `;` and `&&`, `~`, `$HOME`, and `*`/`?` globs in the last path part

type Word = { text: string; glob: boolean };
type Command = { argv: Word[]; out?: { path: string; append: boolean } };
type Pipeline = { cmds: Command[]; op: ";" | "&&" };

function tokenize(line: string): (Word | "|" | ">" | ">>" | ";" | "&&")[] {
  const toks: (Word | "|" | ">" | ">>" | ";" | "&&")[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (c === "#") break;
    if (line.startsWith("&&", i)) { toks.push("&&"); i += 2; continue; }
    if (line.startsWith(">>", i)) { toks.push(">>"); i += 2; continue; }
    if (c === "|" || c === ">" || c === ";") { toks.push(c); i++; continue; }
    let text = "", glob = false;
    while (i < line.length && !" \t|>;".includes(line[i]) && !line.startsWith("&&", i)) {
      const ch = line[i];
      if (ch === "'" || ch === '"') {
        const end = line.indexOf(ch, i + 1);
        if (end < 0) throw new Error("unmatched quote");
        const inner = line.slice(i + 1, end);
        text += ch === '"' ? inner.replace(/\$HOME/g, HOME) : inner;
        i = end + 1;
      } else if (ch === "\\" && i + 1 < line.length) {
        text += line[i + 1];
        i += 2;
      } else {
        if (ch === "*" || ch === "?") glob = true;
        text += ch === "$" && line.startsWith("$HOME", i) ? ((i += 4), HOME) : ch;
        i++;
      }
    }
    toks.push({ text, glob });
  }
  return toks;
}

function parse(line: string): Pipeline[] {
  const toks = tokenize(line);
  const lines: Pipeline[] = [];
  let pipe: Pipeline = { cmds: [], op: ";" };
  let cmd: Command = { argv: [] };
  const endCmd = () => {
    if (!cmd.argv.length) throw new Error("syntax error near unexpected token");
    pipe.cmds.push(cmd);
    cmd = { argv: [] };
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === "|") endCmd();
    else if (t === ">" || t === ">>") {
      const target = toks[++i];
      if (!target || typeof target === "string") throw new Error("syntax error: expected a file after " + t);
      cmd.out = { path: target.text, append: t === ">>" };
    } else if (t === ";" || t === "&&") {
      if (cmd.argv.length) endCmd();
      if (pipe.cmds.length) lines.push(pipe);
      pipe = { cmds: [], op: t };
    } else cmd.argv.push(t);
  }
  if (cmd.argv.length) endCmd();
  if (pipe.cmds.length) lines.push(pipe);
  return lines;
}

function globToRegex(g: string) {
  return new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
}

function expand(sh: Shell, w: Word): string[] {
  if (!w.glob) return [w.text];
  const abs = resolve(sh, w.text);
  const dir = parent(abs), re = globToRegex(base(abs));
  const hits = children(sh, dir).filter((p) => re.test(base(p)) && !base(p).startsWith("."));
  if (!hits.length) return [w.text]; // like bash: an unmatched glob stays as typed
  const rel = !w.text.startsWith("/") && !w.text.startsWith("~");
  return hits.map((p) => (rel ? (resolve(sh, ".") === dir ? base(p) : p) : p));
}

// ---- commands

type Ctx = { sh: Shell; args: string[]; stdin: string | null };
const ok = (out = ""): Result => ({ out, err: "", code: 0 });
const fail = (err: string, code = 1): Result => ({ out: "", err: err + "\n", code });
const lines = (s: string) => (s === "" ? [] : s.replace(/\n$/, "").split("\n"));
const joinLines = (ls: string[]) => (ls.length ? ls.join("\n") + "\n" : "");

/** Splits flags from operands. `-n 5` style options listed in `withValue` take the next argument. */
function opts(args: string[], withValue = "") {
  const flags = new Set<string>(), values: Record<string, string> = {}, rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") { rest.push(...args.slice(i + 1)); break; }
    if (/^-\d+$/.test(a)) { values.n = a.slice(1); continue; }
    if (a.startsWith("-") && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j];
        if (withValue.includes(f)) {
          values[f] = a.slice(j + 1) || args[++i] || "";
          break;
        }
        flags.add(f);
      }
    } else rest.push(a);
  }
  return { flags, values, rest };
}

function readInputs(c: Ctx, files: string[], name: string): { text: string } | Result {
  if (!files.length) return { text: c.stdin ?? "" };
  let text = "";
  for (const f of files) {
    const node = c.sh.fs.get(resolve(c.sh, f));
    if (!node) return fail(`${name}: ${f}: No such file or directory`);
    if (node.type === "dir") return fail(`${name}: ${f}: Is a directory`);
    text += node.content;
  }
  return { text };
}

function write(sh: Shell, path: string, content: string, append: boolean): string | null {
  const abs = resolve(sh, path);
  const node = sh.fs.get(abs);
  if (node?.type === "dir") return `${path}: Is a directory`;
  if (sh.fs.get(parent(abs))?.type !== "dir") return `${path}: No such file or directory`;
  if (!node && sh.fs.size >= MAX_FILES) return `${path}: No space left on device`;
  const next = ((append && node?.type === "file" ? node.content : "") + content).slice(0, MAX_FILE);
  if (totalSize(sh) - (node?.type === "file" ? node.content.length : 0) + next.length > MAX_TOTAL) return `${path}: No space left on device`;
  sh.fs.set(abs, { type: "file", mode: node?.mode ?? 0o644, content: next });
  return null;
}

const modeString = (n: Node) => (n.type === "dir" ? "d" : "-") + [6, 3, 0].map((s) => ((n.mode >> s) & 4 ? "r" : "-") + ((n.mode >> s) & 2 ? "w" : "-") + ((n.mode >> s) & 1 ? "x" : "-")).join("");

function allMatches(re: RE2JS, line: string) {
  const out: string[] = [];
  for (const m = re.matcher(line); m.find(); ) if (m.group()) out.push(m.group()!);
  return out;
}

const run: Record<(typeof COMMANDS)[number], (c: Ctx) => Result> = {
  pwd: (c) => ok(c.sh.cwd + "\n"),
  whoami: (c) => ok(c.sh.user + "\n"),
  hostname: () => ok("lab\n"),
  clear: () => ok(""),
  help: () => ok("Commands: " + COMMANDS.join(" ") + "\nPipes (|), redirects (> and >>), ; and && work. Paths can use ~, . and .., and * or ? globs.\n"),
  echo: (c) => {
    const n = c.args[0] === "-n";
    return ok((n ? c.args.slice(1) : c.args).join(" ") + (n ? "" : "\n"));
  },
  cd: (c) => {
    const target = resolve(c.sh, c.args[0] ?? "~");
    const node = c.sh.fs.get(target);
    if (!node) return fail(`cd: ${c.args[0]}: No such file or directory`);
    if (node.type !== "dir") return fail(`cd: ${c.args[0]}: Not a directory`);
    c.sh.cwd = target;
    return ok();
  },
  ls: (c) => {
    const { flags, rest } = opts(c.args);
    const targets = rest.length ? rest : ["."];
    let out = "";
    for (const t of targets) {
      const abs = resolve(c.sh, t);
      const node = c.sh.fs.get(abs);
      if (!node) return fail(`ls: cannot access '${t}': No such file or directory`, 2);
      let entries = node.type === "dir" ? children(c.sh, abs) : [abs];
      if (!flags.has("a")) entries = entries.filter((e) => !base(e).startsWith("."));
      if (targets.length > 1 && node.type === "dir") out += `${t}:\n`;
      if (flags.has("l")) {
        out += entries.map((e) => { const n = c.sh.fs.get(e)!; return `${modeString(n)} 1 learner learner ${String(n.type === "file" ? n.content.length : 4096).padStart(6)} Nov  4 09:00 ${base(e)}`; }).join("\n") + (entries.length ? "\n" : "");
      } else if (entries.length) out += entries.map(base).join(flags.has("1") ? "\n" : "  ") + "\n";
    }
    return ok(out);
  },
  cat: (c) => {
    const r = readInputs(c, c.args, "cat");
    return "text" in r ? ok(r.text) : r;
  },
  mkdir: (c) => {
    const { flags, rest } = opts(c.args);
    if (!rest.length) return fail("mkdir: missing operand");
    for (const d of rest) {
      const abs = resolve(c.sh, d);
      if (c.sh.fs.has(abs)) { if (flags.has("p")) continue; return fail(`mkdir: cannot create directory '${d}': File exists`); }
      if (!flags.has("p") && c.sh.fs.get(parent(abs))?.type !== "dir") return fail(`mkdir: cannot create directory '${d}': No such file or directory`);
      const made: string[] = [];
      for (let p = abs; p !== "/" && !c.sh.fs.has(p); p = parent(p)) made.push(p);
      if (c.sh.fs.size + made.length > MAX_FILES) return fail(`mkdir: cannot create directory '${d}': No space left on device`);
      for (const p of made.reverse()) {
        if (c.sh.fs.get(parent(p))?.type !== "dir") return fail(`mkdir: cannot create directory '${d}': Not a directory`);
        c.sh.fs.set(p, { type: "dir", mode: 0o755 });
      }
    }
    return ok();
  },
  touch: (c) => {
    for (const f of c.args) {
      const abs = resolve(c.sh, f);
      if (c.sh.fs.has(abs)) continue;
      const e = write(c.sh, f, "", false);
      if (e) return fail("touch: " + e);
    }
    return ok();
  },
  rm: (c) => {
    const { flags, rest } = opts(c.args);
    for (const f of rest) {
      const abs = resolve(c.sh, f);
      const node = c.sh.fs.get(abs);
      if (!node) { if (flags.has("f")) continue; return fail(`rm: cannot remove '${f}': No such file or directory`); }
      if (node.type === "dir" && !flags.has("r") && !flags.has("R")) return fail(`rm: cannot remove '${f}': Is a directory`);
      if (abs === "/") return fail("rm: it is dangerous to operate recursively on '/'");
      for (const k of [...c.sh.fs.keys()]) if (k === abs || k.startsWith(abs + "/")) c.sh.fs.delete(k);
      if (c.sh.cwd === abs || c.sh.cwd.startsWith(abs + "/")) c.sh.cwd = parent(abs);
    }
    return ok();
  },
  rmdir: (c) => {
    for (const d of c.args) {
      const abs = resolve(c.sh, d);
      if (c.sh.fs.get(abs)?.type !== "dir") return fail(`rmdir: failed to remove '${d}': Not a directory`);
      if (children(c.sh, abs).length) return fail(`rmdir: failed to remove '${d}': Directory not empty`);
      c.sh.fs.delete(abs);
    }
    return ok();
  },
  cp: (c) => copyOrMove(c, false),
  mv: (c) => copyOrMove(c, true),
  chmod: (c) => {
    const [mode, ...files] = c.args;
    if (!mode || !files.length) return fail("chmod: missing operand");
    for (const f of files) {
      const node = c.sh.fs.get(resolve(c.sh, f));
      if (!node) return fail(`chmod: cannot access '${f}': No such file or directory`);
      if (/^[0-7]{3}$/.test(mode)) node.mode = parseInt(mode, 8);
      else {
        const m = /^([ugoa]*)([+-])([rwx]+)$/.exec(mode);
        if (!m) return fail(`chmod: invalid mode: '${mode}'`);
        const who = m[1] && m[1] !== "a" ? m[1] : "ugo";
        let bits = 0;
        for (const w of who) for (const p of m[3]) bits |= ({ r: 4, w: 2, x: 1 } as const)[p as "r" | "w" | "x"] << ({ u: 6, g: 3, o: 0 } as const)[w as "u" | "g" | "o"];
        node.mode = m[2] === "+" ? node.mode | bits : node.mode & ~bits;
      }
    }
    return ok();
  },
  grep: (c) => {
    const { flags, rest } = opts(c.args);
    const [pattern, ...files] = rest;
    if (pattern == null) return fail("usage: grep [-icnvo] PATTERN [FILE...]", 2);
    let re: RE2JS; // linear time: the server replays learner sessions, so a pattern must not be able to hang it
    try {
      re = RE2JS.compile(pattern, flags.has("i") ? RE2JS.CASE_INSENSITIVE : 0);
    } catch {
      return fail(`grep: invalid pattern '${pattern}'`, 2);
    }
    const targets = files.length ? files : [null];
    let out = "", hits = 0;
    for (const f of targets) {
      const r = f == null ? { text: c.stdin ?? "" } : readInputs(c, [f], "grep");
      if (!("text" in r)) return { ...r, code: 2 };
      const prefix = files.length > 1 ? `${f}:` : "";
      const matched = lines(r.text).map((l, i) => ({ l, i })).filter(({ l }) => re.test(l) !== flags.has("v"));
      hits += matched.length;
      if (flags.has("c")) out += `${prefix}${matched.length}\n`;
      else if (flags.has("o") && !flags.has("v")) out += joinLines(matched.flatMap(({ l }) => allMatches(re, l).map((m) => prefix + m)));
      else out += joinLines(matched.map(({ l, i }) => prefix + (flags.has("n") ? `${i + 1}:` : "") + l));
    }
    return { out, err: "", code: hits ? 0 : 1 };
  },
  head: (c) => headTail(c, "head"),
  tail: (c) => headTail(c, "tail"),
  wc: (c) => {
    const { flags, rest } = opts(c.args);
    const r = readInputs(c, rest, "wc");
    if (!("text" in r)) return r;
    const counts = { l: lines(r.text).length, w: r.text.split(/\s+/).filter(Boolean).length, c: r.text.length };
    const pick = (["l", "w", "c"] as const).filter((k) => flags.has(k));
    return ok((pick.length ? pick : (["l", "w", "c"] as const)).map((k) => counts[k]).join(" ") + (rest.length === 1 ? ` ${rest[0]}` : "") + "\n");
  },
  sort: (c) => {
    const { flags, rest } = opts(c.args);
    const r = readInputs(c, rest, "sort");
    if (!("text" in r)) return r;
    let ls = lines(r.text);
    ls = flags.has("n") ? ls.sort((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b)) : ls.sort();
    if (flags.has("r")) ls.reverse();
    if (flags.has("u")) ls = ls.filter((l, i) => i === 0 || l !== ls[i - 1]);
    return ok(joinLines(ls));
  },
  uniq: (c) => {
    const { flags, rest } = opts(c.args);
    const r = readInputs(c, rest, "uniq");
    if (!("text" in r)) return r;
    const groups: { line: string; n: number }[] = [];
    for (const l of lines(r.text)) {
      const last = groups[groups.length - 1];
      if (last && last.line === l) last.n++;
      else groups.push({ line: l, n: 1 });
    }
    return ok(joinLines(groups.map((g) => (flags.has("c") ? `${String(g.n).padStart(7)} ${g.line}` : g.line))));
  },
  cut: (c) => {
    const { values, rest } = opts(c.args, "df");
    const delim = values.d ?? "\t";
    if (!values.f) return fail("cut: you must specify a list of fields (-f)");
    const fields = values.f.split(",").flatMap((p) => {
      const [a, b] = p.split("-").map((x) => (x === "" ? NaN : parseInt(x, 10)));
      return p.includes("-") ? Array.from({ length: (isNaN(b) ? 100 : b) - (isNaN(a) ? 1 : a) + 1 }, (_, i) => (isNaN(a) ? 1 : a) + i) : [a];
    });
    const r = readInputs(c, rest, "cut");
    if (!("text" in r)) return r;
    return ok(joinLines(lines(r.text).map((l) => { const parts = l.split(delim); return parts.length === 1 ? l : fields.map((f) => parts[f - 1]).filter((x) => x != null).join(delim); })));
  },
  find: (c) => {
    let start = ".";
    const args = [...c.args];
    if (args[0] && !args[0].startsWith("-")) start = args.shift()!;
    let name: RegExp | null = null, type: string | null = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-name" || args[i] === "-iname") name = new RegExp(globToRegex(args[++i] ?? "*").source, args[i - 1] === "-iname" ? "i" : "");
      else if (args[i] === "-type") type = args[++i] ?? null;
      else return fail(`find: unknown predicate '${args[i]}'`);
    }
    const abs = resolve(c.sh, start);
    if (!c.sh.fs.has(abs)) return fail(`find: '${start}': No such file or directory`);
    const shown = (p: string) => (start === "." ? "." + p.slice(abs === "/" ? 0 : abs.length) || "." : abs === "/" ? p : start.replace(/\/$/, "") + p.slice(abs.length));
    const hits = [...c.sh.fs.entries()]
      .filter(([p, n]) => (p === abs || p.startsWith(abs === "/" ? "/" : abs + "/")) && (!name || name.test(base(p) || "/")) && (!type || (type === "f" ? n.type === "file" : n.type === "dir")))
      .map(([p]) => shown(p))
      .sort();
    return ok(joinLines(hits));
  },
};

function headTail(c: Ctx, which: "head" | "tail"): Result {
  const { values, rest } = opts(c.args, "n");
  const n = parseInt(values.n ?? "10", 10);
  if (isNaN(n)) return fail(`${which}: invalid number of lines`);
  const r = readInputs(c, rest, which);
  if (!("text" in r)) return r;
  const ls = lines(r.text);
  return ok(joinLines(which === "head" ? ls.slice(0, n) : ls.slice(Math.max(0, ls.length - n))));
}

function copyOrMove(c: Ctx, move: boolean): Result {
  const name = move ? "mv" : "cp";
  const { flags, rest } = opts(c.args);
  if (rest.length < 2) return fail(`${name}: missing file operand`);
  const dest = rest.pop()!;
  const destAbs = resolve(c.sh, dest);
  const destIsDir = c.sh.fs.get(destAbs)?.type === "dir";
  if (rest.length > 1 && !destIsDir) return fail(`${name}: target '${dest}' is not a directory`);
  for (const src of rest) {
    const srcAbs = resolve(c.sh, src);
    const node = c.sh.fs.get(srcAbs);
    if (!node) return fail(`${name}: cannot stat '${src}': No such file or directory`);
    if (node.type === "dir" && !move && !flags.has("r") && !flags.has("R")) return fail(`cp: -r not specified; omitting directory '${src}'`);
    const target = destIsDir ? (destAbs === "/" ? "" : destAbs) + "/" + base(srcAbs) : destAbs;
    if (target === srcAbs || target.startsWith(srcAbs + "/")) return fail(`${name}: cannot ${name} '${src}' into itself`);
    if (c.sh.fs.get(parent(target))?.type !== "dir") return fail(`${name}: cannot create '${dest}': No such file or directory`);
    const moved = [...c.sh.fs.entries()].filter(([k]) => k === srcAbs || k.startsWith(srcAbs + "/"));
    const size = moved.reduce((n, [, v]) => n + (v.type === "file" ? v.content.length : 0), 0);
    if (!move && (c.sh.fs.size + moved.length > MAX_FILES || totalSize(c.sh) + size > MAX_TOTAL)) return fail(`${name}: cannot create '${dest}': No space left on device`);
    if (move) for (const [k] of moved) c.sh.fs.delete(k);
    for (const [k, n] of moved) c.sh.fs.set(target + k.slice(srcAbs.length), { ...n });
    if (move && (c.sh.cwd === srcAbs || c.sh.cwd.startsWith(srcAbs + "/"))) c.sh.cwd = target + c.sh.cwd.slice(srcAbs.length);
  }
  return ok();
}

/** Runs one line the learner typed. Changes `sh` in place; returns what to print. */
export function exec(sh: Shell, line: string): Result {
  let pipelines: Pipeline[];
  try {
    pipelines = parse(line.slice(0, 4000));
  } catch (e) {
    return fail(`bash: ${e instanceof Error ? e.message : "syntax error"}`, 2);
  }
  let out = "", err = "", code = 0;
  for (const p of pipelines) {
    if (p.op === "&&" && code !== 0) continue;
    let stdin: string | null = null;
    for (const [i, cmd] of p.cmds.entries()) {
      const argv = cmd.argv.flatMap((w) => expand(sh, w));
      const name = argv[0] as (typeof COMMANDS)[number];
      const fn = Object.hasOwn(run, name) ? run[name] : null;
      const r: Result = fn ? fn({ sh, args: argv.slice(1), stdin }) : fail(`${argv[0]}: command not found`, 127);
      err += r.err;
      code = r.code;
      let text = r.out;
      if (cmd.out) {
        const e = write(sh, cmd.out.path, text, cmd.out.append);
        if (e) { err += `bash: ${e}\n`; code = 1; }
        text = "";
      }
      if (i < p.cmds.length - 1) stdin = text;
      else out += text;
    }
    if (out.length > MAX_OUT) { out = out.slice(0, MAX_OUT) + "\n[output cut off]\n"; break; }
  }
  return { out, err, code };
}

/** Grades the state after a session against the lab's checks. `lastOutput` is what the last command printed. */
export function runChecks(sh: Shell, checks: { name: string; kind: string; path: string; text: string }[], lastOutput: string) {
  return checks.map((ch) => {
    const node = ch.path ? sh.fs.get(resolve({ ...sh, cwd: HOME }, ch.path)) : undefined;
    const content = node?.type === "file" ? node.content : "";
    const pass =
      ch.kind === "exists" ? !!node && (!ch.text || (ch.text === "dir" ? node.type === "dir" : node.type === "file"))
      : ch.kind === "missing" ? !node
      : ch.kind === "contains" ? node?.type === "file" && content.includes(ch.text)
      : ch.kind === "lacks" ? node?.type === "file" && !content.includes(ch.text)
      : ch.kind === "cwd" ? sh.cwd === resolve({ ...sh, cwd: HOME }, ch.text)
      : ch.kind === "output" ? lastOutput.includes(ch.text)
      : false;
    return { name: ch.name, pass };
  });
}

/** Replays a whole session from the starting files: the server grades this way, so the result can't be faked. */
export function replay(files: { path: string; content: string }[], commands: string[]) {
  const sh = createShell(files);
  let last = "";
  const deadline = Date.now() + 3_000; // each command is bounded; this bounds the whole session on the server
  for (const c of commands.slice(0, 300)) {
    if (Date.now() > deadline) break;
    const r = exec(sh, c);
    if (c.trim()) last = r.out;
  }
  return { sh, lastOutput: last };
}
