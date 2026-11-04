# KustomLearn — v1 spec

Open-source (MIT), local-first, bring-your-own-key app. A learner describes what they want to learn; KustomLearn turns it into a personalized, gamified, hands-on course that runs inside the same app. AI runs once, at creation. After that the course is frozen and works offline.

## Who
Self-learners across CS, IT and tech, from beginners to job and certification prep. Desktop-first, mobile-friendly from day one (a native mobile launch is planned later).

## Core flow
1. **Describe.** "What do you want to learn?" in free text.
2. **Understand.** One cheap AI call categorizes the request and condenses the learner's intent into one short line.
3. **Choose.** Three course variations (for example a fast practical one, a deep one and a cert-focused one). The learner picks one and can tweak level, timeline (weeks and hours per week) and content (lessons, quizzes, code, terminal and log labs, capstone).
4. **Approve.** Token and dollar estimate, plus a hard cap at the estimate +30%. Nothing more is generated without approval.
5. **Generate.** A background job: outline, then modules, then lab validation, then link checks. Failed labs auto-repair up to 2 times within the cap. Progress is shown live, and a partial course can be resumed.
6. **Learn.** The course opens in the same app as a game: world map, quests, labs and streaks.

Any AI call after generation names its reason and cost and asks for consent first.

## Course content
- Lessons with diagrams (Mermaid), auto-graded quizzes, and a capstone.
- Three in-browser lab engines: a code sandbox (Python via Pyodide, JS, SQL), a terminal simulator, and log investigation (an in-browser SQL engine over synthetic logs).
- Grading is deterministic, by test cases. Pre-generated tiered hints and a full solution with walkthrough.
- A static dated schedule built from the timeline.
- The plan is locked. To change it, **branch** from a module with a new instruction: a new course that inherits progress up to that point.
- Courses export and import as a `.kustom` bundle; importing needs no API key.

## Gamification (core, not decoration)
- **XP and levels**, with named levels ("Container wrangler") and occasional XP boosts.
- **Streaks** with streak freezes, earned and limited.
- **Ranks from the streak**: Iron 0–2 days, Bronze 3–6, Silver 7–13, Gold 14–29, Platinum 30–59, Emerald 60+. Missing a day without a freeze drops one rank.
- **Daily quests** (claim for XP with confetti), a **weekly chest**, and **boss battles** (mini-boss labs and the capstone as the final boss).
- **World map**: modules as levels with up to 3 stars each (3 stars means first try with no hints).
- **Trophies** (earned and locked, with criteria shown).
- **Daily goal mascot (Pip)**: fills with liquid as study minutes accrue.
- **Study buddies**: collectible characters unlocked by ranks and themed challenges, each one filling with study time.
- Rewards are cosmetic or practical (themes, frames, freezes), never fake.

## Feel
- Dark mode by default, light mode switchable.
- Fluid everywhere: view transitions, entrances, progress that animates, rewarding feedback on every action. All of it respects `prefers-reduced-motion`.
- Mobile-first layout: no horizontal scroll, touch targets of at least 44px, and bottom navigation on phones.
- Visual reference: `docs/design/dashboard-preview.dc.html` (a test view, not production code).

## Architecture
- Next.js full-stack app run locally (`npm run dev`), with SQLite through an ORM that can switch to cloud Postgres via config.
- Clerk is optional, cloud mode only. Local mode has a single implicit user, and `userId` is on every table from day one.
- The API key is entered in Settings and stored server-side in the local database (`.env` works as a fallback). It is never sent back to the browser.
- A provider adapter interface, with only the Anthropic adapter in v1. Every AI output is validated against a schema.

## Out of v1
Other providers, real Docker labs, a public course gallery, adaptive replanning, editing a plan after generation, flashcards, monetization.

## Quality
- Unit tests on schemas, graders and the cost estimator.
- End-to-end tests of the core flow against a fixture course, so no API calls are made.
- CI on GitHub Actions.
- The owner runs separate security audits.
