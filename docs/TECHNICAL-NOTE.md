# Mini AI: Voice Key Account Manager for Snapdeal sellers

**Technical note · Anant Goyal · November 2026 · Demo: https://miniai.anantgoyal.in**

**What it is.** A browser-based **voice** assistant that acts as a seller's Key Account Manager. A seller whose sales
dropped opens it and simply talks. Mini AI has already checked the account, so it:

- greets them and asks why they are calling;
- investigates the drop with real data checks;
- asks about what only the seller knows;
- recommends two or three actions;
- recaps at the end.

It sits on a full seller dashboard (17 pages) with an action tracker the seller approves.

**AI models and voice platform.**

- **Voice conversation: OpenAI `gpt-realtime-2.1`.** One model hears and speaks, connected from the browser over
  **WebRTC** (voice "marin"). Semantic turn detection decides when the seller has finished, and the seller can
  interrupt at any time. It speaks English, Hindi and Hinglish; in Auto mode it replies in the language of each turn.
- **Live transcript on screen:** OpenAI `gpt-transcribe`, running alongside the conversation.
- **Typed chat:** OpenAI **`gpt-5.4-mini`** (Responses API) with the same data tools. A fallback voice uses the
  browser's own speech recognition and speech synthesis.

**Workflow.**

1. The seller opens Mini AI. The server checks the account (sales, orders, price, stock, cancellations) and greets at
   once from the verified figures, then asks why they are calling.
2. On **Live**, the server creates a 120-second OpenAI credential, and the browser connects in the background, so
   **Start** only switches the microphone on. The permanent API key never leaves the server.
3. The seller speaks. The model decides what to look at and calls a **tool**. The browser relays the call to the server,
   which:
   - validates it;
   - runs the data engine;
   - returns a compact result for the model, plus evidence cards shown on screen.
4. Mini AI explains in simple words and leads through the likely causes one at a time (stock, cancellations,
   visibility, price). It asks what the data cannot show ("Do you actually have these sizes at your warehouse?").
5. It recommends 2–3 practical actions, each with what to watch. The seller can approve them into the tracker; Mini AI
   can only propose.
6. When the seller wraps up, it recaps the main issue, the actions and the next step.

**Keeping answers correct.** The data engine, not the model, computes every number and investigation, through 29 typed,
allowlisted tools. Findings are labelled fact, likely cause or hypothesis, and the prompts make the model speak
accordingly:

- stock-outs are "probably part of it, but we can't tell yet exactly how much";
- the overall cancellation rate is never called the seller's fault.

In chat, a server check rewrites an overclaiming answer before it is shown.

**Data and assumptions.** Headline figures are the brief's:

| Metric | Last month | This month |
|---|---|---|
| Sales | ₹2,00,000 | ₹1,35,000 |
| Orders | 400 | 270 |
| Cancellation rate | 8% | 14% |
| Average selling price | ₹500 | ₹500 |
| Out-of-stock | 5 | 18 |

Assumptions:

- "This month" is October 2026 and "last month" is September 2026.
- The cancellation rate is the overall rate: all cancellations ÷ orders placed.
- "Out-of-stock products" counts sizes and colours: 18 of 43, across 10 of the 20 products.

Behind those figures is a **synthetic** dataset for a fictional seller, UrbanCart, generated so it adds up to the
brief's figures exactly:

- 20 products;
- 670 orders;
- 70 cancellations;
- 42 returns;
- 596 shipments;
- 18 reviews;
- 7 suppliers.

No Snapdeal data or systems are used.

**Stack and quality.**

- **App:** a React + TypeScript (Vite) dashboard and a Node + Express API.
- **Hosting:** Vercel, with pages on the CDN and the API in Mumbai, plus Upstash Redis for conversations and the
  tracker.
- **Testing:** 158 automated tests, browser tests on desktop and phone, and live evaluations with the real models
  (English, Hindi, Hinglish, interruption, tracker approval).
- **Cost:** about 5 US cents per spoken answer.
