# Mini AI: final submission report

**Project:** Mini AI, a voice-first Virtual Key Account Manager for a marketplace seller (Snapdeal "AI First Intern"
assignment). **Date:** 11 November 2026. **Location:** `C:\Users\anant\mini-ai`.

> **The assignment is not complete yet.** Two required artifacts need you: the **real-microphone test**
> and the **1–2 minute screen recording**. Deployment is prepared but not done, so **there is no demo URL**.
> Everything else is built and tested; details below.

## 1. Status at a glance

| Item | Status |
|---|---|
| Working product (dashboard, AI, voice, tracker, memory, review) | **Completed** |
| Milestone 5 reasoning fixes (stockout overclaim, cancellation attribution, out-of-stock denominator) | **Completed, tested and passed** (automated + repeated live runs) |
| Unit and server tests | **Tested and passed** (134 / 134) |
| End-to-end browser tests (desktop + phone) | **Tested and passed**: 79 passed, 0 failed, 5 skipped (device-specific) |
| Live OpenAI evaluation | **Tested**: 15 scenarios; one numeric error found by reading and fixed; see section 4 |
| Production build and production start | **Tested and passed** locally (13 / 13 checks, persistence across restart) |
| Docker image | **Not tested** (Docker not installed on this machine) |
| Deployment | **Requires your action**: config ready (`render.yaml`, `Dockerfile`); see `docs/DEPLOYMENT.md` |
| Demo URL | **None** (nothing deployed) |
| Real microphone test (7 steps) | **Requires your action**: `npm run voice:live`. The only real-mic session so far is from Milestone 3, before these changes |
| 1–2 minute screen recording | **Requires your action**: script in `docs/DEMO-SCRIPT.md` |
| One-page technical note | **Completed**: `docs/TECHNICAL-NOTE.md` |
| Screenshots | **Completed**: `shots/m4/` (section 7) |

## 2. What Mini AI is

A seller dashboard (17 pages) with an AI assistant that inspects the account before speaking, answers spoken or typed
questions in English, Hindi or Hinglish using 29 data tools, separates verified facts from likely causes and hypotheses,
proposes prioritised actions with evidence and "check first" cautions, and keeps an Action Tracker that only the seller
can approve. Model: OpenAI **gpt-5.4-mini** via the Responses API, server-side key. Voice: browser Web Speech API
(speech recognition) and `speechSynthesis` (speech). Data: a fictional seller; headline figures from the assignment,
every record synthetic and labelled. Full description: `docs/TECHNICAL-NOTE.md`.

## 3. Milestone 5 work

**Phase 1, reasoning fixes (data layer, prompt layer, server check):**
- *Stockouts.* The sales investigation now states the measured facts first (−32.5%, 130 fewer orders at an unchanged
  ₹500, out-of-stock variants 5 → 18) and calls stockouts "a likely contributing factor, not a proven cause", adding that
  measuring their share needs product-level demand, availability and lost-order evidence. The stockout finding carries an
  explicit `howToState`.
- *Cancellations.* A breakdown separates the **overall** rate (8% → 14%, all initiators) from seller-initiated (3 → 16
  orders, 0.8% → 5.9% of orders), customer-initiated (26 → 21) and marketplace-initiated (3 → 1), and before/after
  dispatch. The KPI, alert and every finding now say "overall".
- *Out-of-stock count* (found in this milestone's live review). The KPI was labelled "products" but counts SKUs; it is
  now "Out-of-stock SKUs (variants)": 18 of 43 SKUs; 10 of 20 products have one out.
- *Server claim check* (`server/src/ai/claims.ts`). Before a reply is spoken, it catches four specific misstatements:
  stockouts as the main driver, a stockout explanation with no "not measured" caveat, the overall rate called
  seller-side, and "18 of 20". It has the model rewrite once with the exact facts; the seller hears only the corrected
  answer. Clean answers cost nothing extra.
- *Tests.* 12 new automated tests (`server/tests/claims.test.ts`): data layer, the check itself, and the engine
  rewriting a scripted overclaiming draft.

**Phase 2, live evaluation:** section 4 and `docs/LIVE-EVALUATION-REVIEW.md`.

**Phase 3, regression:** fixed a page-load race in two tests and a cold-start timing issue (the server now precomputes
its data before accepting requests).

**Phase 4, microphone test prepared:** `npm run voice:live` now checks the server is live, prints the 7 steps, saves the
transcript every few seconds (ending the conversation used to lose it), and writes a measured summary.

**Phase 5, demo:** `docs/DEMO-SCRIPT.md` (timed script) and `npm run demo:reset` (clean tracker and memory).

**Phase 6:** `docs/TECHNICAL-NOTE.md`.

**Phase 7, deployment prepared:** `Dockerfile`, `.dockerignore`, `render.yaml`, `docs/DEPLOYMENT.md`,
`scripts/verify-production.mjs`; `TRUST_PROXY` for per-visitor rate limits behind a proxy; security headers including
`Permissions-Policy: microphone=(self)`.

## 4. Test results (actual)

| Suite | Command | Result |
|---|---|---|
| Typecheck, lint | `npm run typecheck`, `npm run lint` | Clean |
| Client unit | `npm run test:unit` | 6 / 6 passed, 0 skipped |
| Server (incl. 12 new) | `npm run test:unit` | 128 / 128 passed, 0 skipped |
| End-to-end | `npm run test:e2e` | Final run on the final code: **79 passed, 0 failed, 5 skipped**, desktop 1440 × 900 and Pixel 7. Earlier runs this milestone had 1–2 failures from timing under load (greeting and review-page waits); fixed and repeated (40 / 40 assistant tests) |
| Production checks | `npm run verify:production -- http://localhost:4105` | 13 / 13 passed; tracker kept across a restart |
| Live AI, full | `npm run ai:eval` → `live-2026-11-11T04-14-17-725Z.md` | 110 / 110 automated checks; by reading, 14 / 15 scenarios pass and 1 fails (Hindi "20 में से 18"), since fixed |
| Live AI, Phase 1 stability | `--only=01,04,15 --repeat=5` and reruns | 0 of 40 replies called stockouts the main driver; 0 of 40 called the overall rate seller-side |
| Live AI, after the last fix | `--only=10,11,01 --repeat=3` → `live-2026-11-11T04-34-10-354Z.md` | 88 / 90; denominator check 3 / 3 |
| Live UI (real model through the app) | `scripts/m4-live-ui.mjs` (Milestone 4) | Pass: entry Awaiting Approval until the seller approved it |

Skipped end-to-end tests are device-specific by design (e.g. keyboard checks on desktop only, drawer on phone only)
and are not counted as passes.

## 5. Known limitations

- **Live wording still varies.** In the final runs: "the biggest pressure looks like stock" survived one rewrite twice
  (hedged); a return answer called medium-confidence causes "three clear drivers"; a cancellation answer grouped
  delivery-delay cancellations with seller-initiated ones; one sales answer left out "5 to 18".
- **Latency.** Typically 4–9 s per answer; three answers took 28–45 s during one run (API side). A server-check rewrite
  adds 3–5 s when it triggers.
- **Voice** is the browser's: recognition needs Chrome or Edge and goes to the browser vendor's speech service; the
  synthetic voice sounds robotic (OpenAI TTS was postponed as instructed). Not production-grade streaming voice.
- **Data** is a demonstration dataset; no Snapdeal API, no real accounts. Settlements, fees, promotions history, rating
  trends and courier data do not exist in it, and the pages say so.
- **Tracker and memory** are for one demo seller, stored as JSON files; no user accounts.
- **Client bundle** is about 880 KB (not code-split).
- **Evaluation checks** are keyword-based; five known false failures on correct answers are listed in
  `docs/LIVE-EVALUATION-REVIEW.md` (not changed).

## 6. Run it locally

```powershell
cd C:\Users\anant\mini-ai
npm install
# put OPENAI_API_KEY=... in server\.env (copy server\.env.example)
npm run build
npm start                    # http://localhost:4000 (production build)
# or: npm run dev            # http://localhost:5173 with live reload
```
Without a key the dashboard works and the assistant explains how to configure it. `npm run demo:reset` clears the
tracker and memory.

## 7. Screenshots (`shots/m4/`)

Business Review (`desktop-review.png`, `desktop-review-finding.png`), AI Recommendations with cautions
(`desktop-recommendations.png`), add-to-tracker (`desktop-add-dialog.png`), Action Tracker (`desktop-tracker-awaiting.png`,
`desktop-tracker-progress.png`), the assistant's approval card with the **real model** (`live-ui-approval.png`,
`live-ui-approved.png`), seller memory (`desktop-settings-memory.png`), Delivery, Payments, Promotions, Reviews, Help,
Profile, and phone layouts (`phone-*.png`). The `live-ui-*` screenshots were taken with the real model in Milestone 4; the others were regenerated on the final code with the scripted test model (labelled "Test model" in the panel).

## 8. What you need to do

1. **Microphone test** (10 min): `npm run build`, `npm start`, then `npm run voice:live` in a second terminal; follow the
   7 printed steps; close Chrome. The summary is saved to `server/eval-results/voice-live-*.md`.
2. **Screen recording** (15 min): follow `docs/DEMO-SCRIPT.md` (run `npm run demo:reset` first). Real model, real voice;
   no edits that change what the AI said.
3. **Deploy (optional but gives a demo URL)**: `docs/DEPLOYMENT.md`, then `npm run verify:production -- https://YOUR-URL`.
4. **Submit:** the URL (if deployed) or the local run instructions above, the recording, `docs/TECHNICAL-NOTE.md`
   (export to PDF if a document is required), and optionally this report.
