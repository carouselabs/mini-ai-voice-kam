# Mini AI: Virtual Key Account Manager for marketplace sellers

**Technical note · one page · demo build, November 2026**

**What it does.** Mini AI is a seller dashboard with a voice-first assistant that acts like a key account manager. When the
seller opens it, it inspects the account first, then tells the seller what matters (for example "sales fell 32.5%, about
₹65,000, on 130 fewer orders at the same ₹500 price"). It answers spoken or typed questions in English, Hindi or Hinglish,
investigates causes with evidence, proposes prioritised actions, and keeps an action tracker the seller approves.

**Model integration.** The browser never talks to OpenAI. A Node/Express server calls the **OpenAI Responses API** with the
key held only in a server environment variable; it never reaches the browser, the bundle, logs or API responses. Tested
configuration: **gpt-5.4-mini** (the server picks the newest `gpt-*-mini` model the key can use; `OPENAI_MODEL` pins one),
low reasoning effort, `store: false`. Answers are streamed to the browser over server-sent events, including each data
check as it actually runs.

**Tool calling.** The model has 29 strictly-typed functions and nothing else: 24 read-only data functions (sales, orders,
inventory, cancellations, returns, delivery, pricing, reviews, profitability, and seven investigations) and 5 for the seller's
workspace (read the tracker, propose a tracker entry, note something the seller said, recall it, business review). Each
call is allowlisted and argument-validated; results are compacted to fit the context. Up to 8 tool rounds per answer.

**KAM reasoning layer.** The data engine, not the model, computes every figure and investigation. Findings separate
**verified facts** from **supported explanations** and **hypotheses**, each with a confidence, and say what is unknown
(e.g. ad spend). Prompts in three modules (identity, business reasoning, conversation) require the model to look before it
speaks, give the size of a change first, match its words to the confidence ("likely", "might"), keep the overall
cancellation rate apart from seller- and customer-initiated cancellations, and never claim an action it cannot take.
Before a reply is spoken, a server check catches two specific overclaims seen in testing (stockouts called "the main
driver", the overall cancellation rate called "seller-side") and has the model correct them once.

**Speech-to-text.** The browser's **Web Speech API** (`SpeechRecognition`, Chrome or Edge, `en-IN` or `hi-IN`), one utterance
per press of the microphone, with live interim text. In Chrome the audio goes to Google's speech service; nothing is recorded
by Mini AI. In the real-microphone session recorded so far, each spoken question took about 5 s to recognise, including the time spent speaking.

**Text-to-speech.** The browser's **`speechSynthesis`**, sentence by sentence, preferring an Indian English or Hindi voice
(e.g. "Microsoft Heera" on Windows). The seller can interrupt or mute it. This is browser speech, not production-grade
streaming voice. In that session the first spoken words came about 6 s after the question was sent, almost all of it model time.

**Live voice (Milestone 6).** A separate **Live** mode now uses OpenAI's speech-to-speech `gpt-realtime-2.1` over WebRTC,
with a 120-second browser credential from the server and the same data tools. In live tests with generated speech the
median time from the end of a question to the first reply audio was about 2.1 s. The browser voice above stays as the
fallback. See [REALTIME-VOICE-REPORT.md](REALTIME-VOICE-REPORT.md).

**Recommendations and approval.** Fourteen recommendation rules turn findings into prioritised proposals, each with evidence,
an owner, a metric to monitor, how to verify it worked, and a "check first" caution where acting has a risk (e.g. inspect
defective earbuds before reordering). Mini AI's only write actions are: add an entry to the seller's action tracker
**marked Awaiting Approval**, and only when asked; and note something the seller said, labelled as unverified. No tool can
approve, start or complete an action; the seller does that on screen. Mini AI never contacts suppliers, couriers or
customers, and never changes prices, stock, orders, refunds or policies.

**Demo data versus a real integration.** There is **no Snapdeal API integration and no access to real seller accounts.**
The seller (UrbanCart Fashion & Lifestyle) is fictional. The headline figures come from the assignment brief (sales
₹2,00,000 → ₹1,35,000, orders 400 → 270, cancellation rate 8% → 14%, ASP ₹500, out-of-stock 5 → 18); every order, product,
review and shipment behind them is **synthetic**, generated so the records add up to those figures exactly. Every page and
evidence card labels its source. The tracker and memory are saved as JSON files on the server.

**Quality evidence.** 134 automated unit and server tests, an end-to-end browser suite on desktop and phone, and repeated live-model
evaluations with the real API (scenario checks, five-run stability for the fixed reasoning issues). See
`docs/FINAL-SUBMISSION-REPORT.md` for results and known limitations.
