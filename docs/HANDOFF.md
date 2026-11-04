# KustomLearn — handoff (2026-11-04, evening)

Read first: `CLAUDE.md`, `docs/SPEC.md` (source of truth), `docs/PLAN.md` (milestones 0–8), `AGENTS.md` (Next 16: read `node_modules/next/dist/docs`). Use the skills ponytail, karpathy-guidelines, taste-skill (app screens) and ui-ux-pro-max. Load claude-api before touching AI code.

## Repo, branches, PRs
GitHub `Recongohan/KustomLearn`. Commits are authored by **Sadiq Mohammed <71874497+Recongohan@users.noreply.github.com>** (set `git config user.name/user.email` in a new container). Claude appears only as a `Co-Authored-By` line. Never put model IDs in commits, PRs or code.

PRs are stacked. Each targets the branch before it:

| PR | Branch | State |
|---|---|---|
| #1 | `m0-foundation` → `main` | Green, all threads resolved. **Waiting for the owner to merge.** |
| #2 | `m2-intake` → `m0-foundation` | Green. Codex finding (fallback usage) fixed. |
| #3 | `m3-generation` → `m2-intake` | Green. One Codex thread is left open on purpose (null cap for pre-0002 courses; only unreleased dev DBs). The owner decides. |
| #4 | `m4-player` → `m3-generation` | Codex finding (empty quiz) fixed. |
| — | `m5-labs` (from `m4-player`) | Slices 1–2 done; slice 3 in progress. **No PR yet.** |

- **After #1 merges:** retarget #2 to `main`, then #3 after #2, and so on. CodeRabbit only auto-reviews PRs whose base is `main`; Codex reviews every PR.
- **Merge flow:** fix on the lowest branch, then `git merge` upward (m0 → m2 → m3 → m4 → m5), testing each.
- **A new session** must `subscribe_pr_activity` for PRs #1–#4 again.

## Immediate to-dos
1. **Finish milestone 5, slice 3 (terminal labs).** Done so far, committed as WIP on `m5-labs`:
   - `src/lib/labs/shell.ts`: a simulated shell (pure TS, in-memory file tree, pipes, redirects, globs, ~24 commands), plus `replay()` and `runChecks()`.
   - `src/lib/labs/shell.test.ts`: passing.
   - The `TerminalLab`, `TerminalCheck` and `PublicLab` "terminal" types in `src/lib/labs/types.ts`.

   Still to do:
   - `validateTerminalLab`: every solution command must run without "command not found", all checks must pass after replaying the solution, and at least one check must fail on the starting files. Limit file count and size.
   - In `src/lib/ai/generate.ts`: add `terminalLabs` to the `ModuleContent` schema, plus `TERMINAL_RULES` (list the supported commands from `COMMANDS`), the `repairLab` support and a fixture lab in `fixtures.ts`.
   - In `src/lib/generation.ts`: add `labsFor().terminal` and a `check()` branch.
   - In `src/lib/player.ts`: in `playModule`, map the public lab with check names only, never check texts. `labSubmit` takes `{ commands: string[] }` and grades by **server-side `replay()`**, so terminal grades can't be faked. Add zod validation in `actions.ts` (≤300 commands, ≤2000 chars each).
   - `src/components/player/TerminalLab.tsx`: scrollback, prompt `learner@lab:~$`, up/down history, a Reset button, Check, and `LabHelp` (`onUse` can be a no-op or copy the commands). Render it from `src/app/course/[id]/m/[n]/page.tsx`.
   - Tests (generation, player), a browser click-through, then **open the milestone 5 PR** onto `m4-player`.
2. **Then milestone 6 (gamification)**, following the owner's design reference (`docs/design/dashboard-preview.dc.html`, plus the screenshot they shared): a home dashboard with streak, rank, level/XP, Pip daily goal, quests, the mini-boss lab card, an XP chart and trophies.

## What exists (by milestone)
- **M0/1:** shell, themes, PGlite or Neon, settings with an encrypted key, Docker, CI, Sentry gate.
  - Password gate: signed expiring session, 5-try lockout, safe `next`, segment-matched open paths.
- **M2:** intake, giving 3 variations, tuning and a token estimate. **M3:** an Inngest generation job:
  - Token cap with shrink-to-fit, so a call's `max_tokens` is limited to the budget left. Failed and cut-off calls are charged too.
  - Usage counts every fallback attempt and cache read/write.
  - Prompt caching on the shared module prefix.
  - **Model mix:** the chosen model plans (intake, outline); `writerFor()` writes the lessons (Sonnet 5.5 when Opus 5.5 is chosen).
  - No `fallbacks` parameter is sent for Haiku.
- **M4:** world map (horizontal strip on desktop, vertical path on phones), schedule by week, lessons (markdown with no raw HTML, Mermaid strict), quiz graded on the server, stars, the sidebar "Your courses".
- **M5 slice 1:** log labs. The browser runs PGlite; the server compares the rows against reference rows kept server-side. Validation runs in a worker thread with a 10 s kill. Labs are repaired up to twice, otherwise dropped.
- **M5 slice 2:** code labs in Python and JavaScript.
  - **JavaScript:** QuickJS (wasm) on both sides. The server uses `@jitl/quickjs-singlefile-mjs-release-sync`; the browser uses `-browser-release-sync`.
  - **Python on the server:** Pyodide in a child process with `--permission`, an empty env, sockets patched shut, a `process.binding` shim and a 30 s kill.
  - **Python in the browser:** a Web Worker with a 10 s kill. Pyodide is served by the allowlisted route `/pyodide/[file]`.
- **Stars:**
  - Quiz: 3 for a perfect first try, 2 for a first-try pass, 1 for a later pass.
  - Lab: 3 for a first check with no hints, 2 with at most one hint, 1 otherwise or after the solution.
  - A level clears when its quiz and all its labs are cleared; its stars are the lowest of them.

## Owner decisions (don't re-ask)
- Show tokens, not dollars. There is no token allowance window. The plan is locked after generation.
- Use AI only for intake, generation and lab repair. Grading is deterministic. Any later AI call warns the user first.
- Password gate for public self-hosting. Clerk is cloud-only (M8). PGlite locally, Neon in the cloud. Sentry only with a DSN.
- Dark by default with a light switch. Gamify heavily. Mobile-first with 44px targets. Every animation has a reduced-motion fallback.
- The owner may host a paid version (₹199/299/599 a month). A 600K-token course costs about $9 on Opus, $4.60 on Sonnet or $0.23 on Haiku. Model mixing and caching are done.
- **Lab isolation:** learner code runs only in the browser (WASM or simulator). The server runs only model reference solutions, in the sandboxes above. No per-session containers in v1; hardened per-session VMs are a cloud-mode idea for real Docker labs later.
- Keep replies short and say what wasn't checked.

## Backlog from the owner (later, not now)
- A motion pass across the app: animated typing (the describe box on /new and text appearing), visual feedback on every input and action, and animation wherever it fits, each with a reduced-motion fallback.

## Known shortcuts (`grep -rn "shortcut:" src`)
- **Faked results:** for quiz instant-check and for log and code labs, the browser reports its results, so a learner could fake them. Fine for self-study; re-run on the server before any leaderboard. Terminal labs will be replayed on the server.
- **Estimate:** `estimate.ts` prices all input at the full rate and its token constants are untuned. There is no real Claude run yet (no key).
- **Audit:** 10 npm audit findings already existed before this work, in Sentry and Inngest (one high: an old zod inside Inngest). New dependencies added none.

## Run and verify
```
npm ci
KL_FAKE_AI=1 npm run dev           # fixtures, no key; generation needs the Inngest dev server (npm run dev starts both)
npm run lint && npm run typecheck && npm test && npm run build
```
For a production click-through:
1. Run `npm run build`.
2. Start `KL_FAKE_AI=1 APP_SECRET=x PGLITE_DIR=<tmp>/db INNGEST_DEV=1 npx next start -p 3200` and `npx inngest-cli dev -u http://localhost:3200/api/inngest --no-discovery`.
3. Run `curl -X PUT localhost:3200/api/inngest`.
4. Drive the app with Playwright.

On the fixture data, level 1 has no lab with the default plan. Clear its quiz with the answer at index 1.

## Gotchas
- **Database:** the DB is a singleton on `globalThis.__kustomlearnDb`.
- **Next 16:**
  - Use `await connection()` for request-time data.
  - Put `usePathname` under `<Suspense>`.
  - Middleware is `src/proxy.ts`.
  - Run `typecheck` with `rm -rf .next` first if types from another branch linger.
- **Forms:** use `onSubmit` + `startTransition`, not `action=`.
- **Hosted mode:** `currentUserId()` throws when `DATABASE_URL` is set, failing closed. Anything rendered in the shell must also check the password session, because the shell wraps `/login`. See `SidebarCourses`.
- **Turbopack:**
  - It rewrites `require.resolve` into module numbers. Use eval workers with bare imports resolved from the cwd (see `src/lib/labs/validate.ts`), or paths built from `process.cwd()`.
  - The QuickJS "mjs" build imports `module`, so the browser needs the browser build.
- **Node permission model:** this container sets `NODE_OPTIONS=--use-openssl-ca`, which breaks `--permission`. Spawn sandboxes with an explicit minimal `env`.
- **Shell:** shell-safety blocks heredocs containing backticks or `$`; use Write/Edit or Python. Kill servers by PID (`ps -eo pid,args | awk '/next-server/…'`), not `pkill -f`, which can kill your own shell.
- **Tests:** each lab validation boots its own engine (1–3 s), so tests with labs need 30–60 s timeouts. The default test courses set `labs: 0`.

## Later milestones
- 6: gamification engine
- 7: branching, `.kustom` export/import, consent dialog
- 8: Clerk, Neon, cloud
