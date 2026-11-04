# KustomLearn — handoff (2026-11-04)

Read first: `CLAUDE.md`, `docs/SPEC.md` (source of truth), `docs/PLAN.md` (milestones 0–8), `AGENTS.md` (Next 16 rules: read `node_modules/next/dist/docs`).

## Repo and branches
GitHub `Recongohan/KustomLearn`. Commits are authored by **Sadiq Mohammed <71874497+Recongohan@users.noreply.github.com>**. Claude appears only as a `Co-Authored-By` line. Never put model IDs in commits, PRs or code.

| Branch | State |
|---|---|
| `main` | spec, skills, docs |
| `m0-foundation` | **PR #1, open.** Head is `5987dc8`. Holds the app shell, DB, settings, Docker, CI and password gate |
| `m2-intake` | built on m0. Describe → understand → 3 variations → tune → token estimate → lock in. No PR yet |
| `m3-generation` | built on m2. Inngest job: outline → module-N → finalize, with a token cap, pause and resume. No PR yet |

Flow: fix on m0, then `git merge` m0 → m2 → m3, test each and push. **`5987dc8` has not been merged forward yet.**

## Immediate to-dos
1. Merge `m0-foundation` into `m2-intake`, then `m2-intake` into `m3-generation`. Run the checks and push.
2. Reply to and resolve these CodeRabbit threads on PR #1, fixed in `5987dc8`:
   - 4468602840: key hint removed
   - 4468602820: actions pinned to SHAs
   - 4468602860: model select disabled while saving
3. Fix the open gate findings on `646227e` (`src/lib/gate.ts`, `src/proxy.ts`, `src/app/login/actions.ts`):
   - **4468777355**: the session cookie is an HMAC of a fixed label. Make it an independent signed token with an expiry, keyed from APP_SECRET or a derived secret, and keep password checking separate.
   - **4468777312**: add a per-client login rate limit or lockout. In-memory is fine for one instance; note the multi-instance case.
   - **4468777327**: validate `next` by parsing it as a URL. Reject `\`, tabs and `//` variants, and redirect to pathname + search only.
   - **4468777371** (trivial): proxy exclusions should match exactly or on a path segment.
4. Read the queued notifications (`ReadNotifications`). PR #1 is subscribed; a new session must call `subscribe_pr_activity` again.
5. Ask the user: open PRs for m2 and m3 now, or go on to milestone 4?

## Replying to CodeRabbit
gh GraphQL doesn't work here. Use REST and the ccr routes:
- `gh api repos/Recongohan/KustomLearn/pulls/1/ccr/review_threads`
- `.../pulls/1/comments/{id}/replies`
- `.../pulls/1/ccr/comments/{id}/resolve`

End every GitHub post with the Claude Code footer.

## User decisions (don't re-ask)
- Show tokens, not dollars, in the UI. **No** token allowance window.
- Public single-user installs are protected by a shared password (`APP_PASSWORD`). Clerk comes only in cloud mode (milestone 8).
- Locally: PGlite. Cloud: Neon. Sentry is for maintainers and hosted deployments only, gated on a DSN.
- Use AI only for intake and generation. Grading is deterministic, based on test cases. Any extra AI call must warn the user first.
- The plan is locked after generation. Changes go into a new branched course.
- Dark mode is the default, with a light switch. Gamify heavily: ranks Iron→Emerald, streaks, XP, quests, chest, bosses. Pip fills up Waterllama-style. Everything is fluid and mobile-first with 44px targets, and every animation has a reduced-motion fallback.
- Skills to use: ponytail, karpathy-guidelines, taste-skill (app screens), ui-ux-pro-max, coderabbit. Don't use unslop.
- Keep replies short and say what wasn't checked.

## Run and verify
```
npm ci
npm run dev                       # http://localhost:3000, PGlite in ./data
KL_FAKE_AI=1 npm run dev          # m2/m3: fixtures, no API key needed
npx inngest-cli dev               # m3: needed for generation (or docker compose up)
npm run lint && npm run typecheck && npm test && npm run build
```
Notes:
- `typecheck` runs `next typegen` first.
- Tests use in-memory PGlite, configured in `vitest.config.ts`.
- The Docker build is only verified in CI; the sandbox hits Docker Hub rate limits.

## Gotchas
- **Database:** the DB is a singleton on `globalThis.__kustomlearnDb`, because each Next bundle loads its own module copy.
- **Next 16:**
  - Request-time data needs `await connection()`.
  - `usePathname` must sit inside `<Suspense>`.
  - Middleware is `src/proxy.ts`.
- **Forms:** use `onSubmit` + `startTransition`, not `action=`. React resets fields after a form action.
- **Hosted mode:** `currentUserId()` throws when `DATABASE_URL` is set, failing closed until Clerk lands.
- **Shell:** shell-safety blocks heredocs that contain backticks or `$`. Use Write/Edit. Kill dev servers by PID, not `pkill`.

## Backlog from the owner (do later, not now)
- Motion pass across the app: animate typing (e.g. the describe box on /new and text as it appears), visual feedback on every input and action, and animations wherever they fit. Each one needs a `prefers-reduced-motion` fallback.

## Later milestones
- 4: course player (lessons, quizzes, world map)
- 5: labs (code, terminal, logs) with validation in the pipeline
- 6: gamification engine
- 7: branching, export/import, consent
- 8: Clerk, Neon, cloud

Real Claude calls are still untested because there's no key. The token constants in `src/lib/estimate.ts` need retuning against real usage.
