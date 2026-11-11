# Live AI evaluation review (Milestone 5, Phase 2)

**Model:** OpenAI **gpt-5.4-mini** (auto-selected; Responses API, low reasoning effort), real API, real data tools.
**Command:** `npm run ai:eval` (writes `server/eval-results/live-*.md`). The scripted test model was not used for any
result below.

The automated checks are keyword tests, so every answer was also read by hand. Where the two disagree, both are shown.
No check was loosened to make an answer pass. Three checks I had narrowed in Milestone 4 were **restored to their original
wording** for this milestone, and their failures are explained instead.

## 1. Full run, all 15 scenarios: `live-2026-11-11T04-14-17-725Z.md`

Automated result: **110 of 110 checks passed.** My reading found one numeric error and four weaker statements the checks
did not catch (marked **✗** or **△** below). The numeric error has since been fixed and re-tested (section 3).

| # | Seller asked | Tools the model ran | Evidence cited | What Mini AI said (summary) | Correct? | Unsupported or weak statements | Verdict |
|---|---|---|---|---|---|---|---|
| 01 | "My sales have dropped. What's happening?" | investigateSalesDecline, getSellerOverview | FIND-SD-01/02/03 | −32.5% (₹65,000); 400→270 orders at ₹500; out-of-stock variants 5→18; seller-initiated cancellations 3→16; share "isn't measured yet" | Yes | △ "The biggest pressure looks like stock and fulfilment": a ranking the data does not measure (hedged; the server check rewrote the draft once and still flagged it). 28.5 s (rewrite + slow API) | Pass, with note |
| 02 | Same, then "I don't think inventory is the issue. I have stock." | investigateSalesDecline; then getInventoryRisks | FIND-SD-01/02/04 | Accepts, suggests a listing-stock mismatch, names the zero-stock SKUs (T-shirt M/L, earbuds black) | Yes | None | Pass |
| 03 | "Why are my returns going up?" then "Quality is good." | investigateReturnSpike; none | FIND-RE-01/02/03 | 4.3%→12.4%; earbuds, kurta size, bedsheet colour, transit damage; then accepts, mentions the earbuds' 4 confirmed defects once, moves to listing and packaging | Yes | △ "three clear drivers": those causes are medium confidence | Pass, with note |
| 04 | "Customers are cancelling unnecessarily." | investigateCancellationSpike | FIND-CA-01/02/05 | "Not exactly": **overall** rate 8%→14%, customer-initiated fell, rise is seller-initiated (inventory unavailable 2→11), most before dispatch | Yes | △ groups "delivery delay 4→7" under seller-initiated; those are cancellations caused by slow dispatch, not all started by the seller | Pass, with note |
| 05 | "Customers order and return repeatedly." | getCustomerBehaviourPatterns, getReturnAnalysis | — | 4 of 15 customers flagged, two examples with counts, "not proof of misuse", authorised human review, no blocking | Yes | None | Pass |
| 06 | "Why is the Bluetooth speaker not selling?" | searchProducts, getProductPerformance, getReviewsAnalysis, getPricingAnalysis, getInventoryRisks | — | Orders 8→3, price ₹1,199→₹1,399, above the synthetic reference, one "too pricey" review, stock fine | Yes | "mainly because conversion collapsed": conversion is the mechanism, measured; fine | Pass |
| 07 | "Tell me exactly what I should do now." | getBusinessReview, getRecommendedActions | — | Three actions in order, **earbuds quality check before restocking**, what to watch | Yes | None | Pass |
| 08 | "Did my supplier confirm the delivery date today?" | none | — | Can't see supplier messages; data to 1 Nov; offers to note what the seller says | Yes | None | Pass |
| 09 | "sales?" / "and stock?" / "forget that, pricing?" | getSellerOverview; getInventoryRisks; getPricingAnalysis | — | Short, on-topic answers; switches topic cleanly | Yes | "and stock?" took **39.3 s** (API latency) | Pass, with note |
| 10 | Hindi: "मेरी बिक्री कम क्यों हो गई है?"; Hinglish cancellations | investigateSalesDecline; investigateCancellationSpike | FIND-SD-01/02/04; FIND-CA-01/02/03 | Hindi answer with correct −32.5%, ₹65,000, 400→270; Hinglish: overall 8%→14%, seller-initiated rise, 35 of 38 before dispatch | **Partly** | **✗ "20 में से 18 variants"**: wrong; it is 18 of 43 SKUs (10 of 20 products). △ the rewrite added an English clause inside the Hindi answer. Second answer took **44.8 s** | **Fail** (fixed, section 3) |
| 11 | "What should I fix first?" then "add the restock action to my tracker" | investigateAccountHealth, getRecommendedActions, getSellerOverview; proposeTrackerAction | FIND-SD-01, FIND-IN-01/02 | Stock first (13 SKUs with nothing on order, ~₹35,213 estimated); then added **as Awaiting Approval**, asks the seller to approve | Yes | △ the server rewrite put its clause in an awkward place ("Fix stock first, though how much they explain isn't measured yet") | Pass, with note |
| 12 | Speaker question; "The brand raised the price, I can't change it"; new session; "What should I do about the speaker?" | …; rememberSellerContext; getSellerContext at start | FIND-VI-01 | Saves the constraint; next session: "Since you told me the brand sets the price, I would not start with pricing" | Yes | None | Pass |
| 13 | "Give me a business review." | getBusinessReview | — | Health, overall cancellation 14%, biggest risk stock (share not measured), opportunity hedged ("might… data has not shown that yet"), three actions with what to watch | Yes | △ omits that the growing candle set has high cancellations ("fix first" on the page) | Pass, with note |
| 14 | "What actions have I committed to?" | getActionTracker | — | One action, Awaiting Approval, not started, due 13 Nov, not overdue | Yes | None | Pass |
| 15 | (opens the assistant) | getSellerOverview, investigateAccountHealth, getSellerContext | FIND-SD-01/02, FIND-IN-01 | −32.5%, 130 fewer orders at ₹500, variants 5→18 "likely contributing… not measured", **overall** cancellation rate 14% | Yes | None | Pass |

**By my reading: 14 of 15 pass (8 clean, 6 with notes), 1 fails (Hindi numeric error, now fixed).**

## 2. The two Milestone 4 problems: stability over repeated live runs

Problem A, stockouts called "the clearest drivers"; problem B, the overall cancellation rate called "seller-side".
Scenarios 01 (sales), 04 (cancellations) and 15 (greeting), each run five times after the fixes:

| Run | A: never "main/clearest driver" | B: never "seller-side" for the overall rate | Overall rate named as overall | Share of stockouts said to be unmeasured |
|---|---|---|---|---|
| `live-2026-11-11T03-59-21-999Z.md` (data + prompt fix) | 15 / 15 | 15 / 15 | 4 / 5 (04) | 2 / 5 (01; both "passes" were incidental words) |
| `live-2026-11-11T04-05-44-460Z.md` (+ server claim check) | 15 / 15 | 15 / 15 | 5 / 5 | 5 / 5 |
| `live-2026-11-11T04-10-18-893Z.md` (01 and 15, shorter clause) | 10 / 10 | 10 / 10 | 5 / 5 | 5 / 5 |

Before the fix, problem A appeared in 3 of 5 Milestone 4 runs. After it, **0 of 40 replies** called stockouts the main or
clearest driver, and **0 of 40** called the overall rate seller-side. The server check rewrote 7 of 15 drafts in the second
run and 6 of 10 in the third, mostly to add the "not measured" clause, and the rewrites resolved every flag in those
runs. In the full run (section 1) and the later rerun (section 3), one sales answer each kept a hedged "biggest pressure
looks like stock" after its single rewrite.

## 3. After fixing the Hindi denominator: `live-2026-11-11T04-34-10-354Z.md`

Scenarios 10 (Hindi), 11 (tracker) and 01 (sales), three runs each: **88 of 90 checks passed**; "out-of-stock count uses
the right total" passed 3 / 3 and no answer said "18 of 20". The two misses are in 01: one answer omitted the "5 to 18"
figure, and one said "from fewer orders, not lower prices" without "₹500"/"same price", which is correct, but the check's
wording list does not include it (documented, not changed).

## 4. Check limitations found (documented, not changed)

| Check | Correct answer it failed | Why |
|---|---|---|
| 01 "says order volume fell while the average price did not" | "the drop is from fewer orders, not lower prices" | needs "₹500", "same price" or "unchanged" |
| 01 "hedges stockouts as a likely cause" | "the biggest pressures **look like** stockouts" | accepts "looks like", not "look like" |
| 02 "acknowledges the seller" | "Understood." | "understood" is not in its word list |
| 05 "does not tie the repeat customers to unrelated products" | a separate sentence about overall return reasons naming the kurta | flags any product name anywhere |
| 13 "labels an unproven upside as uncertain" | a review naming only a *supported* opportunity | assumes every review names a hypothesis |

## 5. Latency observed (live API)

Typical answers took 4–9 s end to end (tools take milliseconds; the rest is the model). In the final run three answers
took 28.5 s, 39.3 s and 44.8 s, during the same few minutes, which points to API-side latency. A server-check rewrite adds
one model call (about 3–5 s) when it triggers.
