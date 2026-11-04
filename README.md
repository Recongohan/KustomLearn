# KustomLearn

Tell it what you want to learn. It builds you a personal, gamified, hands-on course with labs, quests, streaks and ranks, using your own AI API key, once. Then it runs offline on your machine.

Status: design and spec. See [docs/SPEC.md](docs/SPEC.md).

## Third-party skills
`.claude/skills/` bundles these agent skills, all under the MIT license from their authors:
- [taste-skill](https://github.com/leonxlnx/taste-skill)
- [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [ponytail](https://github.com/DietrichGebert/ponytail)
- [karpathy-guidelines](https://github.com/multica-ai/andrej-karpathy-skills)
- [coderabbit code-review and autofix](https://github.com/coderabbitai/skills) (need the CodeRabbit CLI and `coderabbit auth login`)

## License
MIT

## Run it
**Local** (Node 22+):
```bash
npm install
npm run dev        # app on :3000, job runner on :8288
```
Open http://localhost:3000 and add your Anthropic key in Settings. Data lives in `./data`.

**Docker:**
```bash
docker compose up  # same thing in containers, data in a volume
```

**On a server other people can reach** (a cloud VM, a shared box): set `APP_PASSWORD` so every page asks for it, and serve over HTTPS behind a reverse proxy that sets `X-Forwarded-For` (wrong passwords lock a client out for 15 minutes, counted per server process). With `docker compose`, the job runner runs in dev mode, so for a public server also give Inngest a signing key (Inngest Cloud or a self-hosted `inngest start`).

**Cloud:** run the image `ghcr.io/recongohan/kustomlearn` with `DATABASE_URL` (Neon), `APP_SECRET`, and `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` from Inngest Cloud. See `.env.example`.
