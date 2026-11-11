# Demo recording script (1–2 minutes)

One seller journey, recorded live: real model, real microphone, real data. Nothing below is pre-recorded or scripted
into the app; the words in quotes are what **you** say. Mini AI's answers will differ a little each time.

## Before recording (5 minutes)

1. `server/.env` has your `OPENAI_API_KEY`.
2. In a terminal:
   ```powershell
   cd C:\Users\anant\mini-ai
   npm run demo:reset      # empty Action Tracker and memory, so the approval step starts clean
   npm run build
   npm start               # http://localhost:4000
   ```
   (Or use the deployed HTTPS address if you deploy first.)
3. Open **Google Chrome** at http://localhost:4000, maximise it, close other tabs. Allow the microphone when asked.
4. Settings → "Read answers aloud: On", "Speaking language: English".
5. Do one practice question, then reload the page (a fresh conversation). Leave the tracker as it is unless you add
   something; if you do, run `npm run demo:reset` again and reload.
6. Recorder: Windows **Win + Alt + R** (Xbox Game Bar records the Chrome window with system audio; turn on the
   microphone in Game Bar's Capture settings so your voice is recorded too), or OBS with "Desktop audio" and your
   microphone both on. Both voices must be in the recording.

Answers take about 5–8 s to arrive. If you want to keep to 2 minutes, press **Stop speaking** once the key sentence has
been said; that also shows interruption working.

## Recording

| Time | What you do | What to point at / say |
|---|---|---|
| **0:00–0:15** Introduction | Start on **Overview**. | "This is Mini AI, a virtual key account manager for UrbanCart, a demo fashion and lifestyle seller. Sales fell from two lakh to 1.35 lakh this month, orders from 400 to 270, the overall cancellation rate is up to 14%." Point at the KPI cards and the **Assignment** labels. |
| **0:15–0:45** Voice | Click the purple **Mini AI** button. Let the greeting play (it has already checked the account; note the "Checked:" line). Press the **microphone** and say: **"My sales have dropped. What's happening?"** | Let it answer. It should give the 32.5% drop, fewer orders at the same price, out-of-stock variants 5 → 18 as a *likely* contributor, and seller-initiated cancellations. |
| **0:45–1:10** Evidence | Under the answer click **Show findings**. Open the card's link (e.g. **Inventory** or **Business Analytics**), or go to **Business Review** → Investigations → "Why have my sales declined?" and expand **Stockouts on best-selling sizes are a likely contributor**. | "Every figure comes from the records. It separates what is verified from what is only likely." Point at *Verified in the records*, *Supported explanations (not proven causes)*, *Hypotheses*. |
| **1:10–1:35** Recommendations | Open **AI Recommendations**. | Point at the **Critical** "Reorder out-of-stock best-sellers", its evidence, **Check first: check the Wireless Bluetooth Earbuds for defects before reordering**, and "Metric to monitor". "It recommends; it never contacts suppliers or changes anything itself." |
| **1:35–1:50** Action Tracker | Open Mini AI again (the conversation continues). Press the microphone: **"Add the restock action to my tracker."** | The answer says it was added **as Awaiting Approval**; the card shows **Awaiting Approval** with an **Approve** button. Click **Approve**, then **Open Action Tracker**: the action is there, Approved, with owner and due date. |
| **1:50–2:00** Closing | Open **Business Review**. | "One page with account health, the key risks, growth opportunities, and the top three actions, which update as I approve or reject recommendations." |

## If something goes wrong

- **Speech not recognised:** say it again, or type the same question (still the live model; say on the recording that you typed it).
- **Slow answer:** keep talking over the "Investigating…" status; do not cut to a different take and present it as one.
- **A wrong or overconfident answer:** keep it if you like and say so; do not edit the transcript.

Do not use the scripted test model (`AI_PROVIDER=mock`, replies start with "[Test model]") for the recording.
