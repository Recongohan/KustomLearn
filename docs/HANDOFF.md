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
| #5 | `m5-labs` → `m4-player` | Milestone 5 (log, code and terminal labs). |
| #6 | `m6-gamification` → `m5-labs` | Milestone 6 (gamification). |

- **After #1 merges:** retarget #2 to `main`, then #3 after #2, and so on. CodeRabbit only auto-reviews PRs whose base is `main`; Codex reviews every PR.
- **Merge flow:** fix on the lowest branch, then `git merge` upward (m0 → m2 → m3 → m4 → m5), testing each.
- **A new session** must `subscribe_pr_activity` for PRs #1–#4 again.

## Immediate to-dos
1. **PR #5 (M5) and PR #6 (M6) are open.** Watch them for Codex findings. On PR #5, the two Codex threads have replies and fixes (fe45d4d), but resolving them was blocked by permissions, so they are still open.
2. **Then milestone 7** (branching, `.kustom` export/import, consent dialog). See `docs/PLAN.md`.

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
- **M5 slice 3:** terminal labs. `src/lib/labs/shell.ts` is a simulated shell (pure TS) used by the browser and the server. The browser sends the session's commands and the server grades by `replay()`, so terminal grades can't be faked. grep uses RE2 (`re2js`, linear time), the simulated disk is capped (2,000 entries, 2M characters) and a replay stops after 3 s. Check texts never reach the browser, only their names.
- **M6 gamification:** `src/lib/game.ts` holds the pure rules (levels, the streak/freeze/rank fold, quests, trophies, buddies, mini-bosses). `src/lib/gameplay.ts` reads two append-only logs, `xp_events` (unique per user+key, so no double pay) and `study_days` (a minute per 50 s beat, while a lesson is visible and the learner is active), and computes everything else.
  - Days use the learner's time zone, from the `kl_tz` cookie set in the layout's inline script. The first visit reloads once to set it.
  - XP: a quiz pays 30/40/50 for 1/2/3 stars and a lab 60/80/100, paid as the difference when stars go up. Mini-bosses (the last lab of every third level and of the final level) pay 1.5×.
  - Screens: the home dashboard, /quests (daily quests and the weekly chest), /ranks (the ladder and buddies) and /trophies. The quiz and lab results show +XP with confetti.
- **Key audit (2026-11-04):** full history of every branch and PR scanned for keys; clean. GitHub secret scanning and push protection are on. `.gitignore` also ignores `app-secret` and `**/pglite/`.
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
- **Lab isolation:** learner code and queries run only in the browser (WASM). The server runs model reference solutions in the sandboxes above, and replays learner terminal commands in the in-memory shell simulator (no real processes; capped files, size, regex engine and time). No per-session containers in v1; hardened per-session VMs are a cloud-mode idea for real Docker labs later.
- Keep replies short and say what wasn't checked.

## Backlog from the owner (later, not now)
- Terminal tab completion (not built).
- M6 not built: XP boosts, cosmetic rewards (themes, frames), buddies filling with study time, a capstone final boss, and a level-up celebration.
- A motion pass across the app: animated typing (the describe box on /new and text appearing), visual feedback on every input and action, and animation wherever it fits, each with a reduced-motion fallback.

## Known shortcuts (`grep -rn "shortcut:" src`)
- **Faked results:** for quiz instant-check and for log and code labs, the browser reports its results, so a learner could fake them. Fine for self-study; re-run on the server before any leaderboard. Terminal labs are replayed on the server.
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
2. In one terminal run `KL_FAKE_AI=1 APP_SECRET=x PGLITE_DIR=/tmp/kustomlearn-db INNGEST_DEV=1 npx next start -p 3200`; in a second, `npx inngest-cli dev -u http://localhost:3200/api/inngest --no-discovery`.
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
- **Shell:** shell-safety blocks heredocs containing backticks or `$`; use Write/Edit or Python. Kill servers by PID (`ps -eo pid=,args= | awk '/next-server/ {print $1}'`), not `pkill -f`, which can kill your own shell.
- **Tests:** each lab validation boots its own engine (1–3 s), so tests with labs need 30–60 s timeouts. The default test courses set `labs: 0`.

## Later milestones
- 6: gamification engine
- 7: branching, `.kustom` export/import, consent dialog
- 8: Clerk, Neon, cloud
