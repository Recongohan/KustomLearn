# KustomLearn — implementation plan

Each milestone ships something runnable and is merged through a PR (CodeRabbit review + CI green).

## Stack (versions checked 2026-11-04)
| Concern | Choice |
|---|---|
| App | Next.js 16.4 (App Router, `output: "standalone"`), React 19.3, TypeScript |
| UI | Tailwind 4.3, Motion 14 (springs, layout and view transitions), inline SVG; three.js later for rank-up moments |
| DB | Drizzle 0.45 on Postgres: PGlite 0.5 locally (data in `./data`), Neon (`@neondatabase/serverless` 1.2) when `DATABASE_URL` is set |
| Jobs | Inngest 4.26 (dev server locally and in Docker, Inngest Cloud or self-hosted when deployed) |
| AI | `@anthropic-ai/sdk` 1.4, structured outputs validated with zod 4.6, default model `claude-opus-5-5` (selectable in Settings) |
| Auth | Clerk 7.9, enabled only when Clerk keys are set |
| Errors | Sentry 11.10, enabled only when `SENTRY_DSN` is set |
| Tests | Vitest 5 (unit), Playwright (e2e on a fixture course, no API calls) |
| Labs | Pyodide (Python), Web Worker JS sandbox, PGlite in the browser for SQL and log labs, own terminal simulator |

## Ways to run
- **Local:** `npm install && npm run dev` starts the app and the Inngest dev server. Add your key in Settings.
- **Docker:** `docker compose up` brings up the app plus the Inngest dev server, with PGlite data in a volume.
- **Cloud:** the same image with `DATABASE_URL` (Neon), `APP_SECRET`, the Inngest keys, and optionally Clerk and Sentry.
- **CI:** GitHub Actions runs lint, typecheck, unit tests, build and a Docker build on every PR. On `main`, it pushes the image to GHCR.

## Milestones
0. **Foundation.** Scaffold, dark and light tokens, app shell (sidebar on desktop, bottom nav on phones, animated view transitions), DB schema and migrations, env config, Docker and Compose, CI, CodeRabbit config, Sentry gate.
1. **Settings and key.** Paste the Anthropic key; it is encrypted at rest with an app secret and never returned to the client. Model picker, budget defaults, AI call log.
2. **Intake.** Describe what you want to learn, then intent line plus category plus 3 variations (one structured call), pick and tweak, then the cost estimate with a hard cap. A fixture provider covers tests and runs without a key.
3. **Generation.** An Inngest pipeline (outline, then modules, then lab validation and auto-repair, then link checks), a spend meter against the cap, live progress, and resume.
4. **Course player.** World map, lessons with Mermaid diagrams, quizzes, schedule.
5. **Labs.** Code, terminal and log engines, deterministic graders, tiered hints, unlockable solutions; generated labs are validated against their reference solution.
6. **Gamification engine.** XP and levels, streaks and freezes, ranks from Iron to Emerald, quests and the weekly chest, bosses and stars, trophies, Pip and study buddies, with reward animations on every action.
7. **Ownership.** Branching, `.kustom` export and import, the consent dialog for any later AI call.
8. **Cloud mode.** Clerk, Neon, hosted Inngest, per-user data isolation, deploy guide.

## Definition of done (v1)
A new user goes from describing a topic to playing a validated lab in a generated course, on desktop and phone, through local, Docker and cloud setups. CI is green and the e2e test passes on the fixture course.
