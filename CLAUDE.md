# KustomLearn — working rules

Read `docs/SPEC.md` before building. It is the source of truth.

## How to work
- Code wisely: the smallest complete change (`ponytail`), think before coding and make surgical edits (`karpathy-guidelines`).
- Don't over-talk. Short replies; say what was skipped or not checked.
- UI work: `taste-skill` (app-screen rules) for direction, `ui-ux-pro-max` for accessibility and interaction checks before delivering.
- Gamified and fluid is the product: every screen has motion and feedback, with `prefers-reduced-motion` fallbacks.
- Mobile-first: no horizontal scroll, 44px targets, layouts that port to a native app later.
- Security matters (the owner audits): keys never reach the browser, validate at trust boundaries, sandbox lab code.
- Never put model identifiers in commits, PRs or code comments.
