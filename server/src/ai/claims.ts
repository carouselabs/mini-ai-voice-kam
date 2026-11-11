/**
 * Claim checks on a drafted reply, before the seller hears it. They catch the two overclaims seen in
 * live evaluation: calling stockouts the main driver of the sales drop (the data rates them a likely,
 * medium-confidence contributor), and calling the overall cancellation rate a seller-side figure.
 * A reply with a problem is sent back to the model once, with the exact facts, to be rewritten.
 */
import { formatPercent } from '../../../shared/format.ts'
import type { Store } from '../data/store.ts'
import { contextFor } from '../insights/context.ts'

export type ClaimRule = 'stockout-overclaim' | 'stockout-share-unqualified' | 'overall-rate-as-seller' | 'oos-wrong-denominator'

export interface ClaimProblem {
  rule: ClaimRule
  sentence: string
  fix: string
}

const sentences = (text: string) => text.split(/(?<=[.!?।])\s+/).filter((s) => s.trim())

/**
 * Ranking or proving a cause the data only rates "likely": "the clearest drivers", "the biggest pressures are
 * stockouts", "the main cause", "driven by stockouts", "stockouts caused the drop"…
 */
const OVERCLAIM =
  // Causal words only: "the biggest issue I see is 18 out-of-stock variants" sets a priority, it is not a causal claim.
  /\b(clearest|biggest|main|primary|major|largest|key|chief|root|real|single|dominant)\s+(drivers?|causes?|reasons?|culprits?|factors?|pressures?|contributors?)\b|\bdriven\s+(mainly\s+|mostly\s+|largely\s+|primarily\s+)?by\s+(the\s+)?stock|\bstock\w*\s+(caused|drove|is\s+the\s+reason|are\s+the\s+reason|explains?\s+(the|your)\s+(drop|decline|fall))/i
/** Words that say the stockout share is not measured, or what would measure it. */
const SHARE_CAVEAT =
  /demand|availability|lost[- ]orders?|not (yet )?(proven|measured|confirmed)|unmeasured|isn(’|')?t (yet )?(proven|measured)|can(’|')?t (yet )?(say|prove|measure|tell)|how much (they|stockouts?|stock) (cost|contributed|explains?)/i
const NEGATED = /\bnot\s+(the\s+|a\s+)?(clearest|biggest|main|primary|major|largest|key|chief|root|real|single|dominant|proven)\b/i
// Also the plain-words form the conversation rules ask for ("orders cancelled from your side").
const SELLER_CANCELLATIONS =
  /\bseller[-\s]?(side|initiated|caused|driven)?\s+cancell?ations?\b|\bcancell?ations?\s+(on|from)\s+(the\s+)?seller(['’]s)?\s+side\b|\bcancell?(ed|ations?)\s+(on|from)\s+your\s+(own\s+)?side\b|\byour[-\s]side\s+cancell?ations?\b/i

export function findClaimProblems(text: string, store: Store): ClaimProblem[] {
  const ctx = contextFor(store)
  const oos = ctx.inventory.facts
  const overall = ctx.cancellations.facts
  const seller = ctx.cancellations.breakdown.byInitiator.find((i) => i.label.startsWith('Seller'))
  const overallPoints = Math.round(overall.current * 100)
  const overallFigure = new RegExp(`\\b${overallPoints}(\\.\\d+)?\\s?(%|percent|per\\s?cent)`, 'i')

  const problems: ClaimProblem[] = []
  // An explanation of the sales decline that names stockouts must say their share is not measured.
  const sales = ctx.revenue.facts.sales
  const explainsDecline = new RegExp(`${formatPercent(Math.abs(sales.percentChange ?? 0)).replace('%', '').replace('.', '\\.')}|${Math.abs(sales.change).toLocaleString('en-IN')}`).test(text)
  const stockSentence = sentences(text).find((s) => /stock/i.test(s))
  if (explainsDecline && stockSentence && !SHARE_CAVEAT.test(text)) {
    problems.push({
      rule: 'stockout-share-unqualified',
      sentence: stockSentence.trim(),
      // Short on purpose: spoken replies have word limits, and the greeting is three sentences.
      fix: `Add one short, plain clause of under ten words, for example "but we can't tell yet exactly how much". Keep the reply the same length or shorter: trim another phrase if needed.`,
    })
  }
  // "18 of 20 products": the 18 are SKUs (of 43); 20 is the number of products. Seen in a live Hindi answer.
  const oosSkus = ctx.inventory.totals.outOfStock
  const products = ctx.store.products.length
  const wrongDenominator = new RegExp(
    String.raw`(^|[^\d])${oosSkus}\s+(of|out of)\s+(the\s+|your\s+)?${products}(?!\d)|(^|[^\d])${products}\s+में\s+से\s+${oosSkus}(?!\d)`,
    'i',
  )
  for (const sentence of sentences(text)) {
    if (wrongDenominator.test(sentence)) {
      problems.push({
        rule: 'oos-wrong-denominator',
        sentence: sentence.trim(),
        fix: `${oosSkus} of ${ctx.inventory.totals.activeSkus} SKUs (sizes or colours) are out of stock; ${new Set(ctx.inventory.outOfStock.map((i) => i.productId)).size} of ${products} products have at least one variant out of stock.`,
      })
    }
    if (/stock/i.test(sentence) && OVERCLAIM.test(sentence) && !NEGATED.test(sentence)) {
      problems.push({
        rule: 'stockout-overclaim',
        sentence: sentence.trim(),
        fix: `Stockouts are a likely contributing factor (medium confidence), not a proven, main or clearest driver. Out-of-stock variants rose from ${oos.previous} to ${oos.current}; measuring their share of the decline would need product-level demand, availability and lost-order evidence.`,
      })
    }
    if (SELLER_CANCELLATIONS.test(sentence) && overallFigure.test(sentence) && !/\boverall\b/i.test(sentence)) {
      problems.push({
        rule: 'overall-rate-as-seller',
        sentence: sentence.trim(),
        fix: `${formatPercent(overall.previous)} → ${formatPercent(overall.current)} is the overall cancellation rate (all initiators), not a seller-side figure. Seller-initiated cancellations: ${seller ? `${seller.count.previous} → ${seller.count.current} orders (${formatPercent(seller.shareOfOrders.previous)} → ${formatPercent(seller.shareOfOrders.current)} of all orders)` : 'not available in the data'}.`,
      })
    }
  }
  return problems
}

/** The developer message that asks for a corrected reply. */
export function revisionRequest(problems: ClaimProblem[]): string {
  return [
    '[Check before speaking] Your draft reply overstates or misstates the evidence. Fix only these statements and keep everything else: the length limits and the same JSON format. Write every fix in the same language as the rest of the reply (Hindi stays Hindi), and put it right next to the statement it qualifies so the sentence still reads naturally.',
    ...problems.map((p, i) => `${i + 1}. You wrote: "${p.sentence}" Correct facts: ${p.fix}`),
  ].join('\n')
}
