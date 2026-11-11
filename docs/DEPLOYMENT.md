# Deploying Mini AI

## Live on Vercel (2026-11-11)

**Status:** deployed to Vercel project `mini-ai` (team carouselabs-projects) at https://mini-ai-mu-three.vercel.app.
The domain `miniai.anantgoyal.in` is added to the project and waits for its DNS record. The AI is off until
`OPENAI_API_KEY` is added to the project.

- **Pages** come from Vercel's CDN, Brotli-compressed, with the hashed assets cached for a year.
- **The API** is one Node function in Mumbai (`bom1`), built by `scripts/build-vercel.mjs`. That script bundles the
  server with rolldown, puts the demo data and prompts beside the bundle, and writes the routing.
- **Saved state** is kept in Upstash Redis (`mini-ai-redis`, connected through the Vercel Marketplace), because each
  request can land on a different function instance:
  - conversations (30 minutes);
  - voice calls (2 hours);
  - the Action Tracker;
  - seller memory.

  See `server/src/kv.ts`. Locally nothing changes: the files stay in `server/runtime` and conversations stay in memory.
  `server/tests/hosted.test.ts` checks that a conversation, a voice call and a tracker change carry over between two
  instances sharing one store.
- **Redeploy after any change:** `npm run deploy:vercel`, run from `C:\Users\anant\mini-ai`.
- **Settings on Vercel:**
  - **Required:** `OPENAI_API_KEY`.
  - **Added by the integration:** `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
  - **Defaults in code:** `TRUST_PROXY=1` and `OPENAI_MODEL=gpt-5.4-mini` are set in `server/src/vercel.ts`, and a
    value set in the project overrides them.
- **DNS** (GoDaddy, because anantgoyal.in uses GoDaddy's nameservers): add an A record, name `miniai`, value
  `76.76.21.21`.

The Render steps below were the earlier plan. They still work if a single always-on server is preferred.

## Why Render (or any host that runs one Docker container)

Mini AI is one Node process: the Express API plus the built dashboard. It needs:

- a long-running server (conversations live in memory for 30 minutes; answers stream over server-sent events);
- a writable disk for the Action Tracker and seller memory (JSON files);
- HTTPS, because browsers only allow the microphone on secure origins.

Render, Railway and Fly.io all fit. (Vercel now works too, because shared state moved to Redis; see above. Without
that, its short-lived functions and read-only filesystem would lose conversations and the tracker.) The repo includes `Dockerfile`, `.dockerignore` and a Render Blueprint
(`render.yaml`).

## Steps (Render)

1. **Put the project in a private GitHub repository** (the folder has no git history yet):
   ```powershell
   cd C:\Users\anant\mini-ai
   git init
   git add .
   git status        # check: no server/.env, no node_modules, no server/runtime, no eval-results
   git commit -m "Mini AI"
   ```
   Create an empty **private** repo on GitHub and push to it. `.gitignore` already excludes `.env`, `.env.*`, build
   output, test output and evaluation transcripts.
2. In Render: **New → Blueprint**, pick the repo. Render reads `render.yaml`.
3. When asked for **OPENAI_API_KEY**, paste your key. It is stored as a Render secret, not in the repo.
4. Plan: the Blueprint uses **Starter** with a 1 GB disk at `/data` so the tracker and memory survive restarts. On the
   **free** plan, delete the `disk:` block first: everything works, but the tracker and memory reset whenever the
   instance restarts or sleeps after inactivity (and the first visit after sleeping takes about a minute).
5. Deploy. Render builds the Dockerfile and checks `/api/health`.
6. Check the live site from your computer:
   ```powershell
   node scripts/verify-production.mjs https://YOUR-APP.onrender.com
   ```
   It checks health, that the AI is configured, security headers including `microphone=(self)`, the dashboard routes,
   that the key is not in the browser bundle, and error responses. Then open the URL in Chrome, allow the microphone,
   and ask one question.

## Settings

| Variable | Value | Why |
|---|---|---|
| `OPENAI_API_KEY` | your key (secret) | server-side only |
| `TRUST_PROXY` | `1` | the AI rate limit then applies per visitor, not to everyone behind the host's proxy |
| `MINI_AI_RUNTIME_DIR` | `/data/runtime` | where the tracker and memory are saved (the disk) |
| `AI_RATE_LIMIT` | `40` | AI requests per visitor per 5 minutes |
| `OPENAI_MODEL` | optional | pin a model; otherwise the newest `gpt-*-mini` the key can use |

## What was verified locally (not on a host)

Docker is not installed on this machine, so the image itself was not built here. The same production start path
(`npm run build`, then `node server/src/index.ts` with `NODE_ENV=production`, `TRUST_PROXY=1` and a runtime folder) was
run and checked with `scripts/verify-production.mjs`: **13 of 13 checks passed**, and an action saved before a restart was
still there after it.

## Keep the local version

Nothing here changes how it runs locally: `npm run dev` (development) or `npm run build` then `npm start`
(http://localhost:4000).
