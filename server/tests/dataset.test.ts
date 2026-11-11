import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { ASSIGNMENT_FACTS } from '../src/data/assignment.ts'
import { createStore, readRawData } from '../src/data/store.ts'
import { contextFor } from '../src/insights/context.ts'
import { recommendationsWithFindings, runInvestigation } from '../src/investigations/index.ts'
import { validateStore } from '../src/quality/validate.ts'

const store = createStore(readRawData())
const ctx = contextFor(store)

describe('assignment facts', () => {
  test('are stored unchanged', () => {
    assert.deepEqual(store.facts.metrics, ASSIGNMENT_FACTS)
    assert.equal(store.facts.provenance.sourceType, 'assignment_provided')
  })

  test('required calculations', () => {
    const f = ctx.revenue.facts
    assert.equal(f.sales.change, -65_000)
    assert.equal(f.sales.percentChange, -0.325)
    assert.equal(f.orders.change, -130)
    assert.equal(f.orders.percentChange, -0.325)
    assert.equal(f.averageSellingPrice.change, 0)
    assert.equal(ctx.cancellations.facts.pointChange, 6)
    assert.equal(Math.round((ctx.cancellations.facts.relativeChange ?? 0) * 100), 75)
    assert.equal(ctx.inventory.facts.change, 13)
    assert.equal(ctx.inventory.facts.percentChange, 2.6)
  })

  test('are reproduced by the records', () => {
    const r = ctx.revenue.records
    assert.equal(r.sales.previous, 200_000)
    assert.equal(r.sales.current, 135_000)
    assert.equal(r.orders.previous, 400)
    assert.equal(r.orders.current, 270)
    assert.equal(r.averageSellingPrice.current, 500)
    assert.deepEqual(ctx.cancellations.records.current, { cancelled: 38, orders: 270 })
    assert.equal(ctx.inventory.totals.outOfStock, 18)
    assert.equal(ctx.inventory.totals.outOfStockPrevious, 5)
    assert.ok(ctx.revenue.discrepancies.every((d) => d.withinRounding))
  })
})

describe('data quality', () => {
  test('every check passes', () => {
    const report = validateStore(store)
    const failed = report.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.failures.join('; ')}`)
    assert.deepEqual(failed, [])
    assert.ok(report.checks.length >= 14)
  })

  test('catches a broken reference, an impossible date and a changed fact', () => {
    const raw = readRawData()
    raw.orders.records[0].productId = 'PRD-999'
    const cancelled = raw.orders.records.find((o) => o.orderStatus === 'Cancelled')!
    cancelled.actualDeliveryDate = cancelled.orderDate
    raw.facts.metrics.sales.current = 140_000
    const report = validateStore(createStore(raw))
    const failed = new Set(report.checks.filter((c) => !c.passed).map((c) => c.id))
    assert.ok(failed.has('orders-reference-products'))
    assert.ok(failed.has('dates-consistent'))
    assert.ok(failed.has('assignment-facts-unchanged'))
  })
})

describe('investigations', () => {
  const scenarios = ['sales-decline', 'cancellations', 'returns', 'inventory', 'visibility', 'pricing', 'overview'] as const
  const actionIds = new Set(recommendationsWithFindings(store).map((a) => a.actionId))

  for (const scenario of scenarios) {
    test(`${scenario}: findings carry evidence and only reference real actions`, () => {
      const result = runInvestigation(store, scenario)
      assert.ok(result.findings.length > 0)
      assert.ok(result.checkedAreas.length > 0)
      for (const f of result.findings) {
        assert.ok(f.evidence.length > 0, `${f.findingId} has no evidence`)
        for (const id of f.recommendedActions) assert.ok(actionIds.has(id), `${f.findingId} → missing ${id}`)
        if (f.requiresSellerInput) assert.ok(f.sellerQuestion, `${f.findingId} asks nothing`)
      }
    })
  }

  test('sales decline separates supported causes from hypotheses', () => {
    const result = runInvestigation(store, 'sales-decline')
    const stock = result.findings.find((f) => f.findingId === 'FIND-SD-04')!
    assert.equal(stock.confidence, 'medium')
    assert.ok(stock.possibleCauses.some((c) => c.status === 'hypothesis'))
    assert.match(result.headline, /fell 32\.5%/)
  })

  test('customer patterns never suggest action against customers', () => {
    const findings = runInvestigation(store, 'overview').findings.filter((f) => f.category === 'customers')
    assert.ok(findings.length > 0)
    for (const f of findings) assert.match(f.impact, /never blocks customers, refuses refunds/)
  })

  test('recommendations are proposals that need approval', () => {
    for (const a of recommendationsWithFindings(store)) {
      assert.equal(a.status, 'proposed')
      assert.equal(a.requiresSellerApproval, true)
      assert.ok(a.supportingEvidence.length > 0)
    }
  })

  test('unknown cancellation reasons stay unknown', () => {
    const unknown = store.cancellations.filter((c) => c.cancellationReason === 'Unknown')
    assert.ok(unknown.length > 0)
    const reasons = ctx.cancellations.reasons.find((r) => r.key === 'Unknown')
    assert.equal((reasons?.previous ?? 0) + (reasons?.current ?? 0), unknown.length)
  })
})
