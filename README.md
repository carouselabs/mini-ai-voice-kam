# Mini AI · Voice Key Account Manager for marketplace sellers

**Live demo: https://miniai.anantgoyal.in** (Chrome or Edge; click the purple Mini AI button, then **Live**)

Built for the Snapdeal *AI First Intern* assignment: a browser-based **voice** assistant that talks with a seller whose
sales dropped, works out why from the seller's data, asks sensible follow-up questions, recommends two or three
practical actions, and recaps at the end. The demo seller is fictional (**UrbanCart Fashion & Lifestyle**). The headline
figures come from the assignment. Every record behind them is synthetic and labelled. Nothing is Snapdeal data.

## What it does, mapped to the brief

| The brief asks | Mini AI |
|---|---|
| Greet the seller and understand the reason for the call | Checks the account before the seller speaks, greets in one line, then asks why they're calling |
| Natural two-way voice conversation | Live speech-to-speech with OpenAI `gpt-realtime-2.1` over WebRTC: talk naturally, interrupt any time, English / Hindi / Hinglish; simple everyday words |
| Ask relevant follow-up questions | Leads the call: says what it will check, goes through the causes one at a time, asks only what the data can't show ("Do you actually have these sizes at your warehouse?") |
| Use the data to find issues (pricing, inventory, cancellations, visibility) | 29 data tools over a 670-order synthetic ledger that reproduces the brief's figures exactly; findings marked as fact, likely cause or hypothesis |
| Recommend 2–3 practical actions | Prioritised actions with evidence, what to watch and a "check first" caution; the seller approves them into an action tracker |
| Summarise issues, actions and next steps | A short recap when the seller wraps up or asks |

**How it works:** React dashboard, then a Node/Express API (Vercel, Mumbai), then OpenAI. The browser connects its
microphone straight to OpenAI's Realtime model with a 120-second credential from the server, and the permanent key
never leaves the server. Every data question goes through the server's tools, so the model never invents a figure.
Typed chat uses `gpt-5.4-mini` (Responses API) with the same tools. Saved state (conversations, tracker, memory) is in
Upstash Redis when hosted, and in JSON files locally.

**Documents:** [one-page technical note](docs/TECHNICAL-NOTE.md) · [live voice report](docs/REALTIME-VOICE-REPORT.md) ·
[deployment](docs/DEPLOYMENT.md) · [final QA report](docs/FINAL-SUBMISSION-REPORT.md) ·
[live evaluation review](docs/LIVE-EVALUATION-REVIEW.md)

**Run it locally** (Node.js 22.22+):

```powershell
npm install
copy server\.env.example server\.env    # then put your OPENAI_API_KEY in server\.env
npm run build
npm start                                # http://localhost:4000
```

Tests: `npm run test:unit` (158 tests) and `npm run test:e2e` (Playwright, desktop and phone). Both use a scripted
test model and need no API key. A live evaluation with the real model: `npm run ai:eval` and `npm run voice:eval`
(these use API credit).

---

The rest of this file is the build log, milestone by milestone.

## Milestone 6: live voice (OpenAI Realtime)

The **Live** button in the assistant opens a spoken call with `gpt-realtime-2.1` over WebRTC: talk naturally, interrupt
at any time, English / Hindi / Hinglish / Auto, evidence cards and tracker approvals on screen, mute, stop speaking,
end, reconnect, and a typed fallback. The server issues a 120-second browser credential and runs the same data tools as
the chat; the API key never reaches the browser. The chat and the older browser voice are unchanged. Details, test
results, latency, cost and setup: [docs/REALTIME-VOICE-REPORT.md](docs/REALTIME-VOICE-REPORT.md). Real-microphone test:
`npm run voice:live` (the previous browser-voice recorder is `npm run voice:live:browser`).

## Milestone 4: tracker, memory and business review

- **Action Tracker** (`/actions`): statuses Awaiting Approval, Approved, In Progress, Blocked, Completed, Rejected;
  owner, due date, priority, notes, history, completion date, overdue flags, filters and progress metrics. Allowed
  status changes are enforced by the server (`shared/tracker.ts`, `STATUS_TRANSITIONS`).
- **Approval:** the seller adds a recommendation from AI Recommendations or the assistant. Mini AI's only write tool,
  `proposeTrackerAction`, creates an entry marked Awaiting Approval; no tool can approve, start, complete or reject.
- **Seller memory:** `rememberSellerContext` saves what the seller says (labelled as the seller's statement, never
  verified). New sessions load it with rejected recommendations and open actions. Settings shows it to correct or delete.
- **Business Review** (`/review`): health, key risks, growth opportunities (supported or hypothesis), the top three
  open actions, and every investigation laid out as verified facts / supported explanations / hypotheses / next step.
- **Storage:** JSON files in `server/runtime/` (git-ignored), written atomically. `MINI_AI_RUNTIME_DIR` points
  elsewhere; tests and the evaluation script use throwaway folders. Delete the folder to start fresh.

## Milestone 3: the AI brain and voice

**Turn the AI on:** copy `server/.env.example` to `server/.env`, set `OPENAI_API_KEY=sk-...`, restart `npm run dev`.
`GET /api/ai/health` then shows `configured: true` and the model in use. Without a key the assistant says so and the
dashboard keeps working; nothing is faked. The key is read only by the server and never reaches the browser.

- **Model:** OpenAI Responses API with function calling (`server/src/ai/openai-provider.ts`), `store: false`. Set
  `OPENAI_MODEL` to pin a model; otherwise the server lists the models your key can use and picks the newest
  `gpt-*-mini`. Provider interface: `server/src/ai/provider.ts`. `AI_PROVIDER=mock` is a scripted model for automated
  tests only; its replies start with “[Test model]”.
- **Prompts:** `server/prompts/kam-master-identity.md`, `kam-business-intelligence.md`, `kam-voice-conversation.md`,
  composed with live account context by `server/src/ai/prompts.ts`.
- **Tools:** the 21 Milestone 2 data functions plus `investigatePricing`, `investigateAccountHealth` and
  `searchProducts` (`server/src/ai/tools.ts`), strict schemas, allowlisted, argument-validated, results compacted
  (`compact.ts`). At most `AI_MAX_TOOL_ROUNDS` rounds per answer.
- **Conversation:** `server/src/ai/engine.ts`, `sessions.ts` (in-memory, 30-minute expiry, 10-turn history),
  routes in `server/src/routes/ai.ts`: `GET /api/ai/health`, `POST /api/ai/sessions` (proactive greeting, streamed),
  `POST /api/ai/chat` (streamed tool events + reply), `GET /api/ai/sessions/:id`, `POST /api/ai/sessions/:id/end`.
- **Voice:** browser Web Speech API behind `client/src/lib/voice.ts` (speech recognition `en-IN` / `hi-IN`, speech
  synthesis sentence by sentence). Chrome and Edge on desktop. Firefox has no speech recognition: text still works.
- **Scenario evaluation:** `npm run ai:eval` (live model) writes transcripts to `server/eval-results/`.
- **Real-browser voice check:** `node scripts/voice-check.mjs <url> <wav> --headed` (Google Chrome).

## Run it

Requires Node.js 22.22 or newer.

```powershell
npm install
npm run dev
```

Open http://localhost:5173. The API runs on http://localhost:4000 and Vite forwards `/api` to it.

Production (one process serves the API and the built client):

```powershell
npm run build
npm start          # http://localhost:4000
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (watch mode) and Vite client together |
| `npm run build` | Typechecks the server, typechecks and builds the client |
| `npm start` | Express serves `/api` and `client/dist` |
| `npm run typecheck` / `npm run lint` | TypeScript and oxlint, both workspaces |
| `npm run data:generate` | Rebuilds `server/data/*.json` from the catalogue design (deterministic seed) |
| `npm run test:unit` | Client display tests + server calculation, dataset, data-quality and API tests |
| `npm run test:e2e` | Builds, then Playwright in Chromium at desktop and phone sizes |
| `node scripts/shots.mjs` | Screenshots of key screens into `shots/` (dev server running) |

## Data and provenance

Two kinds of data, always labelled (`sourceType` on every record and response):

- **`assignment_provided`**: the brief's aggregates, stored unchanged in `server/src/data/assignment.ts`:
  sales ₹2,00,000 → ₹1,35,000, orders 400 → 270, cancellation rate 8% → 14%, ASP ₹500 → ₹500, out-of-stock 5 → 18.
- **`synthetic_demo`**: every record, generated by `server/scripts/generate-data.ts` from `server/scripts/catalogue.ts`.

The generator solves order counts so the records **reproduce the assignment totals exactly** (Sep: 400 orders,
₹2,00,000; Oct: 270 orders, ₹1,35,000; 32 and 38 cancellations; 5 and 18 out-of-stock SKUs). October's records give a
14.07% cancellation rate, flagged as matching after rounding.

| Dataset | Records | Notes |
|---|---|---|
| Products | 20 | 43 SKUs (sizes and colours); visibility, conversion, prices, costs |
| Orders | 670 | Full ledger: 400 in Sep, 270 in Oct, one unit each |
| Cancellations | 70 | 32 Sep, 38 Oct; unknown reasons stay Unknown |
| Returns | 42 | 16 Sep, 26 Oct |
| Shipments | 596 | Every dispatched order; dispatch time, delays, issues |
| Inventory | 43 | One per SKU; cover, status, restock dates |
| Customer profiles | 15 | Anonymised; customers with 2+ orders; pattern flags |
| Suppliers | 7 | Fictional, marked “(Demo)” |
| Reviews | 18 | Synthetic text |
| Pricing | 20 | Synthetic reference prices, not competitor data |

Assumptions (also returned by `GET /api/seller/profile`): “this month” = October 2026, “last month” = September 2026,
data refreshed 1 Nov 2026; sales = gross value of orders placed; out-of-stock counted per SKU; cancellation rate =
cancelled ÷ orders placed (same cohort); return rate = returns ÷ delivered orders (same cohort).

## API

All responses: `{ data, meta: { dataMode, sourceTypes, lastUpdatedAt, freshness, periods, total?, filters?, notes? } }`.
Errors: `{ error: { code, message, details? } }` with 400 for invalid input, 404 for unknown resources and 409 for
conflicts. The store data is read-only; only the seller's workspace (tracker, decisions, memory) can change.

- Seller: `/api/seller/profile`, `/api/seller/overview`
- Analytics: `/api/analytics/{revenue|orders|cancellations|returns|inventory|products|delivery|profitability|pricing|reviews|customers|catalogue}`
- Records: `/api/products`, `/api/products/:productId`, `/api/orders`, `/api/orders/:orderId`, `/api/cancellations`,
  `/api/returns`, `/api/inventory`, `/api/customers/patterns`, `/api/suppliers`, `/api/reviews`, `/api/shipments`
- Filters (where relevant): `period`, `status`, `productId`, `category`, `startDate`, `endDate`, `q`, `limit`, `offset`
- Investigations: `/api/investigations/{sales-decline|cancellations|returns|inventory|visibility|pricing|overview}`
- `/api/actions/recommendations` (each with its tracker state), `POST /api/actions/recommendations/:id/reject`
  (`{ reason }`), `POST …/:id/restore`
- Tracker: `GET /api/tracker`, `POST /api/tracker` (`{ recommendationId | title, owner?, dueDate?, priority?, note?,
  approve? }`), `POST /api/tracker/:id/approve`, `PATCH /api/tracker/:id` (`{ status?, owner?, dueDate?, priority? }`),
  `POST /api/tracker/:id/notes` (`{ text }`)
- Memory: `GET /api/memory`, `PATCH /api/memory/:id` (`{ text }`), `DELETE /api/memory/:id`, `DELETE /api/memory`
- `/api/review` (business review), `/api/data-quality`, `/api/health`

## Server structure

```
shared/                 Types and formatting used by server and client (records, analytics, insights, api)
server/
  scripts/              catalogue.ts (synthetic design), generate-data.ts (deterministic generator)
  data/                 Generated JSON datasets (the central source of truth)
  src/
    data/               store.ts (load + index), assignment.ts (brief figures)
    analytics/          math, rules (inventory, pricing, customers), revenue, cancellations, returns,
                        inventory, products, delivery, profitability, people, overview
    insights/           context.ts (analyses cached per dataset), recommendations.ts, review.ts (business review)
    investigations/     sales (decline, visibility, pricing), operations (cancellations, returns, inventory), index
    services/kam-data.ts  Data-access functions for the AI, with the data-awareness contract
    ai/                 engine, provider (OpenAI + mock), tools, workspace-tools, prompts, sessions
    workspace/          tracker.ts, memory.ts, json-file.ts (atomic JSON storage in server/runtime)
    quality/validate.ts   14 automated data-quality checks
    http/, routes/      Query validation, response envelope, route handlers
  tests/                calculations, dataset + investigations, API
```

## Client structure

```
client/src/
  app/          App, router (one page per sidebar item), navigation, assistant provider
  components/   layout, dashboard cards, charts (Recharts), data (DataTable, Loaded, StatTile, status), ai,
                workspace (add-to-tracker and other dialogs), ui
  pages/        Overview, records/ (Products, Inventory, Orders, Cancellations, Returns), Delivery, Payments,
                Promotions, Reviews, Analytics, BusinessReview, Recommendations, ActionTracker, Settings, Help,
                Profile, NotFound, RouteError
  hooks/        useApi (cached read-only data), useLiveApi (tracker/memory, reloads on change), useSeller, …
  lib/          api (fetch, sendApi + change notifications), format (display only), cn, voice, ai-client
```

## Design system

All colours, type sizes, radii, shadows, layout sizes and easing curves are tokens in
`client/src/styles/tokens.css`; the default Tailwind palette is switched off. Deep purple is the only accent. Charts
use emphasis (this month in purple, last month in grey) on one axis, with legends and a table view; status colours
always come with a text label.
