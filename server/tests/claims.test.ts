/**
 * Regression tests for the two Milestone 4 live-evaluation problems:
 *  A. stockouts called "the clearest drivers" of the sales decline (they are a likely, medium-confidence contributor);
 *  B. the overall cancellation rate (8% → 14%) called "seller-side cancellations".
 * Checked at the data layer (what tools return) and the reasoning layer (drafts are corrected before the seller hears them).
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { findClaimProblems } from '../src/ai/claims.ts'
import { readAiConfig } from '../src/ai/config.ts'
import { runTurn } from '../src/ai/engine.ts'
import type { InputItem, ModelProvider, ModelRequest, ModelResult } from '../src/ai/provider.ts'
import { createAiService } from '../src/ai/service.ts'
import { executeTool } from '../src/ai/tools.ts'
import { getStore } from '../src/data/store.ts'
import { contextFor } from '../src/insights/context.ts'
import { investigateOverview, runInvestigation } from '../src/investigations/index.ts'

process.env.MINI_AI_RUNTIME_DIR = mkdtempSync(path.join(tmpdir(), 'mini-ai-claims-'))
const store = getStore()

describe('data layer: sales decline states causes no stronger than the evidence', () => {
  const sales = runInvestigation(store, 'sales-decline')

  test('the headline gives the measured facts and calls stockouts a likely contributor', () => {
    assert.match(sales.headline, /32\.5%/)
    assert.match(sales.headline, /unchanged ₹500 average selling price/)
    assert.match(sales.headline, /from 5 to 18/)
    assert.match(sales.headline, /likely contributing factor, not a proven cause/)
    assert.match(sales.headline, /product-level demand, availability and lost-order evidence/)
    assert.doesNotMatch(sales.headline, /strongest|driver|main cause/i)
  })

  test('the stockout finding is medium confidence and says how to state it', () => {
    const f = sales.findings.find((x) => x.findingId === 'FIND-SD-04')!
    assert.equal(f.confidence, 'medium')
    assert.match(f.howToState ?? '', /never the main, biggest or clearest driver/)
  })

  test('no finding anywhere calls stockouts the main or clearest driver', () => {
    for (const f of investigateOverview(contextFor(store)).findings) {
      const text = [f.title, f.observation, f.impact, ...f.possibleCauses.map((c) => c.cause)].join(' ')
      assert.equal(findClaimProblems(text, store).filter((p) => p.rule === 'stockout-overclaim').length, 0, f.findingId)
    }
  })
})

describe('data layer: cancellation figures say which rate they are', () => {
  const c = contextFor(store).cancellations

  test('the breakdown separates overall, initiators and stages, and adds up', () => {
    assert.equal(c.breakdown.overallRate.label, 'Overall cancellation rate (all initiators)')
    assert.deepEqual([c.breakdown.overallRate.previous, c.breakdown.overallRate.current], [0.08, 0.14])
    const labels = c.breakdown.byInitiator.map((i) => i.label)
    assert.deepEqual(labels.sort(), ['Customer-initiated cancellations', 'Marketplace-initiated cancellations', 'Seller-initiated cancellations'])
    const seller = c.breakdown.byInitiator.find((i) => i.label.startsWith('Seller'))!
    assert.deepEqual(seller.count, { previous: 3, current: 16 })
    // Initiator counts add up to every cancellation in each month.
    for (const period of ['previous', 'current'] as const) {
      const sum = c.breakdown.byInitiator.reduce((s, i) => s + i.count[period], 0)
      assert.equal(sum, c.breakdown.overallRate.cancelled[period])
      assert.equal(c.breakdown.byStage.reduce((s, x) => s + x.count[period], 0), c.breakdown.overallRate.cancelled[period])
    }
    assert.ok(c.breakdown.byStage.some((s) => /after dispatch/i.test(s.label)))
  })

  test('the out-of-stock KPI says it counts SKUs, not products', () => {
    const run = executeTool(createAiService(readAiConfig({ AI_PROVIDER: 'mock' })).tools, 'getSellerOverview', '{}', store)
    assert.match(run.output, /Out-of-stock SKUs \(variants\)/)
    assert.match(run.output, /18 of 43 SKUs/)
    assert.match(run.output, /10 of 20 products have at least one variant out of stock/)
  })

  test('the overview KPI and every finding label the 14% as overall, never seller-side', () => {
    const run = executeTool(createAiService(readAiConfig({ AI_PROVIDER: 'mock' })).tools, 'getSellerOverview', '{}', store)
    assert.match(run.output, /Cancellation rate \(overall\)/)
    for (const f of investigateOverview(contextFor(store)).findings) {
      const text = [f.title, f.observation, f.impact, ...f.evidence.map((e) => `${e.label} ${e.value}`)].join(' ')
      assert.equal(findClaimProblems(text, store).filter((p) => p.rule === 'overall-rate-as-seller').length, 0, f.findingId)
    }
  })
})

describe('claim checks', () => {
  const problems = (text: string) => findClaimProblems(text, store).map((p) => p.rule)

  test('catch the two overclaims seen in live evaluation', () => {
    assert.deepEqual(problems('The clearest drivers are stockouts on best-selling sizes plus more seller-side cancellations, which rose to 14%.'), [
      'stockout-overclaim',
      'overall-rate-as-seller',
    ])
    assert.deepEqual(problems('Stockouts are the main cause of the drop.'), ['stockout-overclaim'])
    assert.deepEqual(problems('Sales were driven mainly by stockouts.'), ['stockout-overclaim'])
    assert.deepEqual(problems('Seller-side cancellations rose from 8% to 14 percent.'), ['overall-rate-as-seller'])
    // Seen in Milestone 5 runs: a superlative ranking, and a decline explanation with no word on how much stockouts explain.
    assert.deepEqual(problems('The biggest pressures are stockouts, which rose from 5 to 18 variants.'), ['stockout-overclaim'])
    assert.deepEqual(problems('Sales fell 32.5%, about 65,000. Out-of-stock variants rose from 5 to 18.'), ['stockout-share-unqualified'])
    // Seen in a live Hindi answer: 18 out-of-stock SKUs described as 18 of the 20 products.
    assert.deepEqual(problems('20 में से 18 variants stockout में गए।'), ['oos-wrong-denominator'])
    assert.deepEqual(problems('18 of 20 products are out of stock.'), ['oos-wrong-denominator'])
    // The same mistakes in the plain words the conversation rules now ask for.
    assert.deepEqual(problems('14 percent of orders were cancelled from your side.'), ['overall-rate-as-seller'])
    assert.deepEqual(problems('Your-side cancellations jumped to 14%.'), ['overall-rate-as-seller'])
    assert.deepEqual(problems('Sales are down 32.5%, so about a third. Stock running out is the main reason.'), ['stockout-share-unqualified', 'stockout-overclaim'])
  })

  test('leave accurate statements alone', () => {
    assert.deepEqual(problems('Stockouts are a likely contributor; out-of-stock variants rose from 5 to 18.'), [])
    assert.deepEqual(problems('Stockouts are not the main proven cause, but they likely contributed.'), [])
    assert.deepEqual(problems('The overall cancellation rate rose to 14%, and seller-initiated cancellations went from 3 to 16.'), [])
    assert.deepEqual(problems('Seller-initiated cancellations rose from 3 to 16 orders.'), [])
    assert.deepEqual(problems('The main driver is lower order volume at the same price.'), [])
    assert.deepEqual(problems('Sales fell 32.5%. Stockouts rose from 5 to 18 and are a likely contributor, but their share is not measured yet.'), [])
    // A priority, not a causal claim (seen in a live greeting that then hedged the cause correctly).
    assert.deepEqual(problems('The biggest issue I see is 18 out-of-stock variants.'), [])
    assert.deepEqual(problems('18 of 43 SKUs are out of stock; 10 of 20 products have a variant out.'), [])
    // Plain-words versions that are accurate.
    assert.deepEqual(problems('Overall, 14 out of every 100 orders got cancelled. Orders cancelled from your side went from 3 to 16.'), [])
    assert.deepEqual(problems('Sales are down 32.5%, about a third. Running out of stock is probably part of it, but we can’t tell yet exactly how much.'), [])
  })
})

/** Replies with scripted text and records what it was asked. */
class ScriptedProvider implements ModelProvider {
  readonly name = 'mock' as const
  requests: ModelRequest[] = []
  private replies: string[]
  constructor(replies: string[]) {
    this.replies = replies
  }
  resolveModel() {
    return Promise.resolve('scripted')
  }
  generate(request: ModelRequest): Promise<ModelResult> {
    this.requests.push(request)
    const reply = this.replies.shift() ?? 'Nothing left.'
    const text = JSON.stringify({ reply, language: 'en', findingIds: [], actionIds: [], links: [] })
    return Promise.resolve({ items: [{ role: 'assistant', content: text } as InputItem], text, functionCalls: [], model: 'scripted' })
  }
}

async function turn(replies: string[]) {
  const ai = createAiService(readAiConfig({ AI_PROVIDER: 'mock' }))
  const provider = new ScriptedProvider(replies)
  const session = ai.sessions.create()
  const reply = await runTurn(
    { provider, tools: ai.tools, store, maxToolRounds: 2 },
    session,
    [{ role: 'user', content: 'Why did my sales drop?' } as InputItem],
    () => {},
    AbortSignal.timeout(5000),
    'Why did my sales drop?',
  )
  return { reply, provider }
}

describe('reasoning layer: an overclaiming draft is corrected before the seller hears it', () => {
  test('stockouts called the clearest driver → rewritten with the exact facts', async () => {
    const { reply, provider } = await turn([
      'Sales fell 32.5%. The clearest drivers are stockouts on best-selling sizes.',
      'Sales fell 32.5% with 130 fewer orders at the same ₹500 price. Out-of-stock variants rose from 5 to 18, a likely contributor; how much they explain is not measured yet.',
    ])
    assert.equal(provider.requests.length, 2)
    const request = JSON.stringify(provider.requests[1].input)
    assert.match(request, /Check before speaking/)
    assert.match(request, /likely contributing factor \(medium confidence\)/)
    assert.equal(provider.requests[1].toolChoice, 'none')
    assert.match(reply.text, /a likely contributor/)
    assert.deepEqual(reply.claimCheck, { revised: ['stockout-share-unqualified', 'stockout-overclaim'], remaining: [] })
  })

  test('the overall rate called seller-side → rewritten with the initiator figures', async () => {
    const { reply, provider } = await turn([
      'Seller-side cancellations rose to 14%.',
      'The overall cancellation rate rose to 14%; seller-initiated cancellations went from 3 to 16 orders.',
    ])
    assert.match(JSON.stringify(provider.requests[1].input), /Seller-initiated cancellations: 3 → 16 orders/)
    assert.deepEqual(reply.claimCheck, { revised: ['overall-rate-as-seller'], remaining: [] })
    assert.match(reply.text, /overall cancellation rate/)
  })

  test('the corrected reply replaces the draft in the conversation history', async () => {
    const ai = createAiService(readAiConfig({ AI_PROVIDER: 'mock' }))
    const provider = new ScriptedProvider(['The main cause is stockouts.', 'Stockouts are a likely contributor.', 'Follow-up answer.'])
    const session = ai.sessions.create()
    const deps = { provider, tools: ai.tools, store, maxToolRounds: 2 }
    await runTurn(deps, session, [{ role: 'user', content: 'Why?' } as InputItem], () => {}, AbortSignal.timeout(5000), 'Why?')
    await runTurn(deps, session, [{ role: 'user', content: 'And then?' } as InputItem], () => {}, AbortSignal.timeout(5000), 'And then?')
    const history = JSON.stringify(provider.requests[2].input)
    assert.doesNotMatch(history, /The main cause is stockouts/)
    assert.match(history, /Stockouts are a likely contributor/)
  })

  test('a draft that is already accurate is not sent back', async () => {
    const { reply, provider } = await turn([
      'Sales fell 32.5%; stockouts are a likely contributor (their share is not measured) and the overall cancellation rate rose to 14%.',
    ])
    assert.equal(provider.requests.length, 1)
    assert.equal(reply.claimCheck, undefined)
  })
})
