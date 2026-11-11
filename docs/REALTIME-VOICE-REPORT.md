# Milestone 6: Live voice with the OpenAI Realtime API

Mini AI now holds a real spoken conversation: the seller presses **Live**, talks naturally (no button per sentence),
can interrupt at any time, and Mini AI answers in English, Hindi or Hinglish from the same verified data tools as the
chat. The permanent OpenAI key never leaves the server.

## Status at a glance

| | Result |
|---|---|
| Build (`npm run build`) | passes |
| Unit and server tests (`npm run test:unit`) | **154 of 154 pass** (6 client, 148 server; 20 of them new for live voice) |
| Browser tests (`npm run test:e2e`) | **87 passed, 0 failed, 5 skipped** (the 5 are desktop-only or phone-only checks skipped on the other device); includes the new live-voice tests on desktop and phone |
| Live API, generated speech (`npm run voice:eval`) | English 8/8, Hindi 6/6, Hinglish with switching 6/6, Stop speaking 2/2, Tracker approval 3/3 (see "Test results" for which run each comes from) |
| Real Chrome over WebRTC to OpenAI, fake microphone tone | connected, greeting played, the tone interrupted it |
| **Real microphone test** | **not done yet.** It needs a person speaking: `npm run voice:live` (steps below). Nothing in this report claims it passed. |
| Deployment | not deployed (as instructed) |

## What the seller sees

- A **Live** button in the Mini AI panel header. The text chat and the older browser voice stay exactly as they were;
  **Chat** (top left of the live view) goes back to them.
- **Language selector:** Auto · English · हिन्दी · Hinglish. The choice is remembered in the browser. It can be changed
  during a call.
- A large **orb** that grows with the audio level, a **waveform** (hidden when the system asks for reduced motion), and a
  plain status line: Connecting, Listening, Hearing you, Checking your data, Speaking ("Talk any time to interrupt"),
  Muted, Reconnecting, or an error with what to do next.
- A **live transcript**: what the seller said and what Mini AI said, with "(interrupted)" when an answer was cut off.
- **Evidence cards** from each data check appear in the transcript, the same cards as the chat. When Mini AI proposes a
  tracker action, the approval card appears with Approve / Reject; Mini AI itself never approves anything.
- Controls: **Mute / Unmute**, **Stop speaking**, **End call**, **Retry** after an error, and an "Or type here" box that
  sends a typed question into the same live call.
- Clear messages when the microphone is blocked ("Allow the microphone…") or live voice is unavailable (the reason is
  shown and the chat still works).

Screenshots: `shots/m6/live-voice-greeting.png` (real OpenAI call in Chrome), `live-voice-start-desktop.png`,
`live-voice-call-desktop.png`, `live-voice-call-phone.png` (these three use a scripted test connection, marked "Test
model" in the header, to show the layout without spending API credit).

## Model choice

| Option | Why / why not |
|---|---|
| **`gpt-realtime-2.1` (chosen)** | Speech in, speech out in one model, so there is no separate speech-to-text and text-to-speech hop. Native function calling, so it can use Mini AI's existing data tools. Officially supported over WebRTC with short-lived browser credentials. Speaks Hindi and Hinglish. Confirmed available on this account with the API's model list. |
| `gpt-realtime-2.1-mini` | About a quarter of the price for the same conversation (see Cost). Not tested live here; KAM answers chain several data checks, so the full model is the default. Switch with one setting. |
| `gpt-live-1` | Priced per minute and built around handing work to a back-end agent. Newer and less documented; it would have meant restructuring the tools. Not chosen. |
| Chained (speech-to-text → text model → text-to-speech) | What the browser voice already does. In Milestone 5 the first spoken words came about 6 s after a question. Too slow for a phone-like call. |

Voice: **marin** (OpenAI's recommended voice for this model). I cannot listen to audio, so this is OpenAI's
recommendation, not a judgement by ear. Any of alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin or cedar
can be set with `OPENAI_REALTIME_VOICE`.

## How it works

```
Browser (client/src/lib/realtime.ts)                Mini AI server                          OpenAI
1. POST /api/realtime/session {language}  ───────▶  checks limits, builds the session:
                                                    instructions, 19 tools, voice, speech
                                                    recogniser, turn detection          ──▶ POST /v1/realtime/client_secrets
   ◀─────── {voiceSessionId, clientSecret ek_…, expires in 120 s}                       ◀── (uses the permanent key)
2. microphone + SDP offer, Bearer ek_…  ──────────────────────────────────────────────────▶ POST /v1/realtime/calls
   ◀═══════════ audio both ways (WebRTC) + events on the "oai-events" data channel ═══════▶
3. model asks for a tool (response.done → function_call)
   POST /api/realtime/tool {voiceSessionId, callId, name, arguments} ─▶ validates, runs the EXISTING tool,
   ◀── {output (compact JSON), evidence cards, tracker cards}            records it for audit
   function_call_output + response.create ────────────────────────────────────────────────▶ model speaks the answer
4. language change → POST /api/realtime/language ─▶ returns new instructions ─▶ session.update to OpenAI
5. transcript lines → POST /api/realtime/transcript;  End call → POST /api/realtime/session/:id/end
```

- **Same brain as the chat.** The instructions are the chat's KAM modules (identity, business reasoning, evidence
  rules) without the chat's JSON reply format, plus spoken-call rules: two or three sentences, the key figure first,
  numbers said clearly, no IDs or field names read out, "the details are on your screen".
- **Verified account snapshot.** Headline figures (sales, orders, price, overall cancellation rate with seller- and
  customer-initiated counts, out-of-stock SKUs with the 18 of 43 SKUs / 10 of 20 products denominators, return rate)
  are computed by the data engine and put in the instructions, so the greeting needs no tool call. The snapshot says
  stockouts are a likely contributor, not a proven cause, and that the overall rate is not seller-side.
- **Seller memory.** What the seller told Mini AI before, rejected recommendations and open tracker actions are included,
  so the call continues from the chat.
- **Tools** (`server/src/realtime/tools.ts`): the same 19 tools as the chat, from `getSellerOverview` and the
  `investigate…` tools to `proposeTrackerAction` and `rememberSellerContext`. Each runs through the chat's existing
  `executeTool`, and its output is compacted to 6,000 characters so the spoken conversation stays fast and cheap.
- **Tracker safety.** `proposeTrackerAction` can only create an action in **Awaiting Approval**; approving, starting and
  completing stay with the seller on screen. Tested.

## Languages

- **English / हिन्दी / Hinglish** fix the reply language. The speech recogniser gets a hint for English and Hindi.
- **Auto** answers in the language of the seller's latest turn. In live tests the model drifted back to English after
  English tool results (4 of 5 Hindi answers came back in English) and prompt changes alone did not fix it. Now the
  browser detects the language of each finished seller turn (`detectSpokenLanguage` in `shared/realtime.ts`:
  Devanagari, or two or more common Hindi words in Latin letters, means Hindi or Hinglish; turns under three words never
  switch) and updates the session. After this change Hindi passed 6/6 and Hinglish 6/6.
- Asking to switch works in Auto ("Explain in English", then "Hindi mein samjhao": both passed).
- In Auto mode the greeting is in English, because the seller has not spoken yet. Pick हिन्दी or Hinglish to be greeted in
  that language.

## Interruptions and call control

- **Barge-in:** OpenAI's turn detector (`semantic_vad`, eagerness high, with `interrupt_response`) stops the answer when
  the seller starts talking. Over WebRTC, OpenAI also drops the audio that had not been played yet, so the model's memory
  matches what the seller actually heard. Verified in real Chrome with a fake microphone tone (the greeting was
  cancelled when the tone started). Not yet verified with a human voice.
- **Stop speaking** sends `response.cancel` and clears the output audio. Verified live, 2 of 2.
- **Mute** disables the microphone track (nothing is sent). **End call** closes the connection and ends the server
  session.
- **Reconnect:** if the connection drops, the browser waits 4 s for it to recover, then reconnects up to twice with a new
  short-lived credential and replays the last 8 transcript lines with "do not greet again". Tested with the scripted
  connection, not with a real network drop.
- **Echo:** the microphone is opened with echo cancellation, noise suppression and automatic gain. If Mini AI keeps
  cutting itself off on laptop speakers, use headphones.

## Security and limits

- The permanent `OPENAI_API_KEY` is read only on the server. The browser receives only a short-lived `ek_…` secret that
  expires 120 s after creation; the browser uses it only to open the call. A test checks that the session response never contains
  the permanent key. Responses carry `Cache-Control: no-store`. No secret is logged; `voice:live` keeps only the call ID.
- OpenAI receives a hashed client identifier (`OpenAI-Safety-Identifier`), never an IP address or a name.
- **Limits:** starting a call is limited to max(10, `AI_RATE_LIMIT`) per client every 10 minutes (HTTP 429 after that).
  At most 5 live calls per network address (an abuse limit, not one call per person, because offices share addresses);
  a new call from the same tab replaces its previous one. Each call accepts at most 150 tool calls and ends after
  60 minutes.
- **Tool relay:** only the 19 listed tools run; arguments are validated against each tool's schema; a call ID is run
  only once (a repeat gets the saved result, so nothing runs twice); calls for an ended or unknown session are refused;
  every call is recorded (name, arguments, ok, time) for audit.
- **No audio is stored.** The server never receives audio. Transcript text is kept in server memory for the call
  (at most 300 lines, cleared an hour after the call ends or on restart). `npm run voice:live` writes a text summary of
  the call to `server/eval-results/` for the test record; it records no audio.
- Known limit: the browser holds the call, so a seller could edit their own session instructions over the data channel.
  That can only change how their own call talks; tool execution stays allowlisted and validated on the server, and the
  tracker still needs their approval.

## Test results

Three different kinds of test, kept separate:

**1. Automated, no OpenAI calls** (free, run on every change)

- `server/tests/realtime.test.ts`, 20 tests: health; the secret never contains the permanent key; the session
  configuration; the instructions (no JSON format, snapshot and memory included); Hindi mode; input validation; the
  tool relay (compact output, a call ID is run only once, Awaiting Approval only, unknown tools and bad arguments
  refused); language updates; transcript, audit and end; replacing a call and the per-address limit; OpenAI failure →
  502 with a plain message; no key → unavailable; rate limit → 429; configuration parsing; language detection.
- `tests/e2e/live-voice.spec.ts`, 4 tests × desktop and phone = 8, with a scripted test connection injected into the
  browser: a full call (greeting, seller turn, tool evidence card, answer, Stop speaking, Mute, End), microphone
  blocked, reconnect replays the conversation without a second greeting, and back to the chat.
- The whole suite: 154 unit/server tests and 87 browser tests pass; nothing was weakened to pass.

**2. Live OpenAI API with generated seller speech** (`npm run voice:eval`; costs credit)

Seller questions are spoken by OpenAI text-to-speech and streamed in real time into a real `gpt-realtime-2.1` session
created through our own `/api/realtime/session`, with tools run through our own `/api/realtime/tool`. This is real model
behaviour, but it is synthetic speech over a WebSocket, **not a microphone**. Every answer, tool call and timing is in
`server/eval-results/realtime-*.md`.

| Scenario | Checks | Result | File |
|---|---|---|---|
| English: sales, cancellations, stock, what to do first, follow-up | uses data first, 32.5%, overall rate with initiators separated, names products, keeps context, English, no overclaims, no IDs | 8/8 | `realtime-2026-11-11T09-39-36-522Z.md` (also 8/8 in `09-41-27-921Z`) |
| Hindi | recognises Hindi, replies in Hindi, uses data, decline figure, no overclaims, no IDs | 6/6 | `realtime-2026-11-11T10-18-21-676Z.md` |
| Hinglish + switching | Hinglish first reply, switches to English when asked, back to Hindi when asked, real return rate 57.1%, no overclaims, no IDs | 6/6 | `realtime-2026-11-11T10-18-21-901Z.md` |
| Stop speaking | the answer is cancelled; the next question is answered correctly | 2/2 | `realtime-2026-11-11T09-41-27-921Z.md` |
| Tracker approval | proposes through the tool, says it awaits approval, never claims it is approved | 3/3 | `realtime-2026-11-11T09-41-27-921Z.md` |

How these numbers came about:

- The run of all five scenarios (`09-41-27-921Z`) scored **23 of 25**. The 2 failures were Hindi and Hinglish answers that
  came back in English. That led to the per-turn language detection above. Hindi and Hinglish were then re-run on their
  own and passed 6/6 each.
- A final run of all five together after that fix scored 0 of 25, because the account ran out of credit
  (`credit_balance_exhausted`; file `10-20-51-926Z`). It was not repeated, to save credit. So English, Stop and Approval
  results come from before the language fix. That fix only changes what happens when the seller's language changes.
- **Checks corrected during the work:** two checks were themselves wrong, and both were fixed **before** any result in
  this table was reported:
  - "biggest reason" flagged a correct, factual ranking of cancellation reasons as an overclaim, so the stock overclaim
    check now looks at each sentence;
  - a barge-in test over WebSocket was invalid, because the model generates audio faster than real time, so there is
    nothing left to interrupt. It was replaced by the Stop-speaking test, and real barge-in is left to WebRTC.

**3. Real Chrome over WebRTC** (`scripts/realtime-browser-check.mjs`; costs a little credit)

Real Chrome, real OpenAI WebRTC connection, a generated tone as the microphone: connected, the greeting audio started,
and when the tone began the greeting was cancelled (barge-in). Connection set-up took **13.7 s** on that first, cold
attempt, which is too slow. It was measured once only; the real microphone test will measure it again.

**4. Real microphone: not done.** It needs a person. See "How to run the microphone test".

## Latency (from the live runs above; synthetic speech)

Across the 31 scored turns with the default turn detector:

- **Seller stops talking → first reply audio:** median **2.1 s**. 22 of 31 turns were under 3 s, 2 were between 3 and 4 s,
  and 7 took longer than 4 s (the slowest 12.4 s).
- **Turn detector decides the seller has finished → first audio:** median **about 1 s** (0.55–4.2 s). This is the model's
  own speed, including any data tool.
- **Data tools on the server:** median 7 ms, at most 36 ms. Tools are never the bottleneck.
- **The slow turns came from the turn detector waiting** after the synthetic speech ended (12.4 s in total versus
  0.9 s after its decision). A real voice may behave differently. If it feels slow in the microphone test, set
  `OPENAI_REALTIME_TURN_DETECTION=server:700`, which replies 700 ms after silence. In one comparison run, that setting
  had a median of 3.1 s against 1.6 s for the default.
- For comparison, the Milestone 5 browser voice took about 6 s to its first spoken words.
- Answers often run longer than the 50-word target (some are 70–100 words), and the "let me check" bridge is sometimes
  a full sentence instead of five words. Both make answers slower to finish and dearer, and are a tuning item for after
  the microphone test.

## Cost

List prices per million tokens:

| | Text in | Cached in | Audio in | Text out | Audio out |
|---|---|---|---|---|---|
| gpt-realtime-2.1 | $4 | $0.40 | $32 | $24 | $64 |
| gpt-realtime-2.1-mini | $0.60 | $0.06 | $10 | $2.40 | $20 |

- Measured, English run (greeting and 4 answers): **$0.27**, about **5 US cents per spoken answer**.
  - About 60% of the cost is the spoken audio Mini AI produces.
  - The instructions and earlier tool results are re-read every turn, but mostly at the cached rate (87,552 of 93,727
    input tokens were cached).
- The same tokens on **gpt-realtime-2.1-mini** would cost **$0.07**, about 1.4 cents per answer (about 4× cheaper;
  quality not tested).
- All live voice testing in this milestone cost about **$4.71** across 91 answers (about 5.2 cents each), plus a little
  for generating the test speech.
- **What spends credit:**
  - `npm run voice:live`, while you talk;
  - `npm run voice:eval`, about $1.10 for all five scenarios;
  - `npm run ai:eval` (text chat);
  - using the app's chat or live voice.
- `npm run test:unit` and `npm run test:e2e` never call OpenAI.

## Known limitations

1. **No real-microphone test yet**, so real barge-in, real-world accents and background noise are unverified.
2. **The text chat's claim check does not run on live speech.** That check rewrites a draft that overclaims, but live
   audio is spoken as it is generated, before the server sees the text. Live voice relies on:
   - the instructions;
   - the labelled snapshot and tool outputs (`howToState`, initiator split, denominators);
   - the live checks, which found no overclaim in the scored runs.
3. **Connection set-up took 13.7 s** in the one real WebRTC attempt (cold). It still has to be measured on a normal
   start.
4. **Answer length** often goes past the spoken target (see Latency).
5. **The voice was not compared by ear.**
6. **Reconnect** is tested only with the scripted connection.
7. **Untested platforms:** phone browsers with a real microphone, Safari and Firefox. Chrome and Edge on desktop are the
   target. The page must be on `localhost` or HTTPS for the microphone to work.
8. **The old browser voice is kept.** It stays in the chat, as instructed, until the new voice has been verified with a
   real microphone.

## How to run the microphone test

PowerShell, two terminals, in `C:\Users\anant\mini-ai`:

```powershell
# Terminal 1
npm run build
npm start            # app on http://localhost:4000

# Terminal 2
npm run voice:live   # opens Chrome on Live voice, prints what to say, saves server\eval-results\voice-live-*.md
```

Press **Start live voice**, allow the microphone, and follow the printed steps:

1. English questions.
2. Hindi questions.
3. Hinglish.
4. "Explain that in English", then "Hindi mein samjhao".
5. Interrupt it mid-answer.
6. A follow-up question.
7. **End call**, then close Chrome.

The saved file shows what was recognised, the transcript, every data tool, connection time, first-audio times,
interruptions, tokens and cost. Whether the answers were right is judged by reading it.

## Environment variables (`server/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | (required) | The existing key; also used by the chat. Server only. |
| `OPENAI_REALTIME_MODEL` | `gpt-realtime-2.1` | `gpt-realtime-2.1-mini` is about 4× cheaper. |
| `OPENAI_REALTIME_VOICE` | `marin` | alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar. |
| `OPENAI_REALTIME_TRANSCRIBE_MODEL` | `gpt-transcribe` | Speech recogniser for the on-screen transcript. |
| `OPENAI_REALTIME_REASONING` | `low` | minimal, low, medium, high. |
| `OPENAI_REALTIME_TURN_DETECTION` | `semantic:high` | `semantic:auto`, or `server:700` (reply after 700 ms of silence). |
| `AI_PROVIDER` | `openai` | `mock` only for automated tests (live voice then uses a scripted connection). |
| `AI_RATE_LIMIT` | 40 | Also raises the call-start limit when it is above 10. |

Nothing is added to the client's environment. The browser never needs a key.

## OpenAI dashboard

- **Billing:** the account needs credit (Settings → Billing). With no credit, live voice, the chat and both evals fail
  with `credit_balance_exhausted`. Credit was added after the last run; no live test has been run since, to save it.
- **Nothing else needs configuring.** No webhook, no SIP and no allowed-domain setting is used. The current key already
  has access to `gpt-realtime-2.1` (checked with the model list).
- If the key is ever replaced with a *restricted* key, it needs access to the Realtime API (client secrets) as well as
  the Responses API used by the chat.

## Files

New:

- `shared/realtime.ts`: browser and server contract, language detection.
- `server/src/realtime/config.ts`, `instructions.ts`, `tools.ts`, `sessions.ts`: configuration, voice instructions,
  tool relay, call sessions and limits.
- `server/src/routes/realtime.ts`: `/api/realtime/health`, `session`, `tool`, `language`, `transcript`,
  `session/:id/end`, `session/:id`.
- `server/tests/realtime.test.ts`: 20 server tests.
- `server/scripts/realtime-eval.ts`: the live evaluation (`npm run voice:eval`, `-- --only=en,hi,hinglish,stop,approval`,
  `--turn=…`).
- `client/src/lib/realtime.ts`: the `LiveVoice` call (WebRTC, events, tools, language, reconnect, metrics).
- `client/src/components/ai/LiveVoiceView.tsx`: the live voice screen.
- `tests/e2e/live-voice.spec.ts`: 8 browser tests.
- `scripts/realtime-browser-check.mjs`: real Chrome over WebRTC with a fake microphone.
- `scripts/m6-shots.mjs`: screenshots.
- `scripts/voice-live-browser.mjs`: the previous `voice:live` recorder for the browser voice, now
  `npm run voice:live:browser`.
- `docs/REALTIME-VOICE-REPORT.md`: this report.

Changed:

- `server/src/app.ts`, `server/src/routes/index.ts`: mount the realtime routes.
- `server/src/ai/engine.ts`: evidence and tracker cards exported for reuse.
- `server/src/ai/prompts.ts`: account context exported for reuse.
- `server/src/ai/compact.ts`: the output size limit is now a parameter.
- `client/src/components/ai/AssistantPanel.tsx`, `AssistantHeader.tsx`: the Live button and live mode.
- `scripts/voice-live.mjs`: rewritten for the real-microphone Realtime test.
- `package.json`, `server/package.json`: `voice:eval`, `voice:live`, `voice:live:browser`.
- `server/.env.example`: the new variables.

Unchanged and still working: the text chat, the browser voice (`client/src/lib/voice.ts`) and every page from
Milestones 1–5.
