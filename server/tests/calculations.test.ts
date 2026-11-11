import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { compare, compareRates, toneFor } from '../src/analytics/compare.ts'
import { customerPatternFlag } from '../src/analytics/customer-rules.ts'
import { estimatedDaysRemaining, inventoryStatus, runsOutBeforeReplenishment } from '../src/analytics/inventory-rules.ts'
import { percentChange, percentagePointChange, ratioOrZero, safeDivide } from '../src/analytics/math.ts'
import { discountFromMrp, grossMargin, pricingPosition, suggestedPriceRange } from '../src/analytics/pricing-rules.ts'

describe('percentage change', () => {
  test('relative change of the assignment sales figures', () => {
    assert.equal(percentChange(200_000, 135_000), -0.325)
    assert.equal(percentChange(400, 270), -0.325)
    assert.equal(percentChange(5, 18), 2.6)
  })
  test('no base gives null, never Infinity or NaN', () => {
    assert.equal(percentChange(0, 10), null)
    assert.equal(safeDivide(1, 0), null)
    assert.equal(ratioOrZero(5, 0), 0)
  })
  test('compare returns change and direction', () => {
    assert.deepEqual(compare(200_000, 135_000), { previous: 200_000, current: 135_000, change: -65_000, percentChange: -0.325, direction: 'down' })
    assert.equal(compare(500, 500).direction, 'flat')
  })
})

describe('percentage-point change', () => {
  test('cancellation rate 8% → 14% is +6 points and +75% relative', () => {
    assert.equal(percentagePointChange(0.08, 0.14), 6)
    const rate = compareRates(0.08, 0.14)
    assert.equal(rate.pointChange, 6)
    assert.equal(Math.round((rate.relativeChange ?? 0) * 1000) / 1000, 0.75)
    assert.equal(rate.direction, 'up')
  })
  test('good or bad depends on polarity', () => {
    assert.equal(toneFor('up', 'lower-is-better'), 'negative')
    assert.equal(toneFor('down', 'lower-is-better'), 'positive')
    assert.equal(toneFor('down', 'higher-is-better'), 'negative')
    assert.equal(toneFor('flat', 'higher-is-better'), 'neutral')
  })
})

describe('stock cover and status', () => {
  test('days remaining = stock ÷ daily sales, unknown without sales', () => {
    assert.equal(estimatedDaysRemaining(3, 0.74), 4.1)
    assert.equal(estimatedDaysRemaining(10, 0), null)
    assert.equal(estimatedDaysRemaining(0, 1), 0)
  })
  const base = { inTransitStock: 0, reorderLevel: 9, averageDailySales: 0.74, supplierLeadTimeDays: 10 }
  test('status rules', () => {
    assert.equal(inventoryStatus({ ...base, availableStock: 0 }), 'Out of Stock')
    assert.equal(inventoryStatus({ ...base, availableStock: 0, inTransitStock: 20 }), 'Replenishment Pending')
    assert.equal(inventoryStatus({ ...base, availableStock: 3 }), 'Critical')
    assert.equal(inventoryStatus({ ...base, availableStock: 6 }), 'Low Stock')
    assert.equal(inventoryStatus({ ...base, availableStock: 60 }), 'Healthy')
  })
  test('runs out before replenishment only when cover is shorter than the lead time and nothing is in transit', () => {
    assert.equal(runsOutBeforeReplenishment({ ...base, availableStock: 3 }), true)
    assert.equal(runsOutBeforeReplenishment({ ...base, availableStock: 3, inTransitStock: 10 }), false)
    assert.equal(runsOutBeforeReplenishment({ ...base, availableStock: 60 }), false)
    assert.equal(runsOutBeforeReplenishment({ ...base, availableStock: 3, averageDailySales: 0 }), false)
  })
})

describe('margin and pricing', () => {
  test('gross margin and discount', () => {
    assert.equal(grossMargin(1199, 1060), 0.1159)
    assert.equal(grossMargin(0, 10), 0)
    assert.equal(discountFromMrp(1199, 3999), 0.7002)
  })
  test('pricing position bands', () => {
    assert.equal(pricingPosition(1399, 1149), 'Significantly Expensive')
    assert.equal(pricingPosition(799, 699), 'Slightly Expensive')
    assert.equal(pricingPosition(599, 579), 'Competitive')
    assert.equal(pricingPosition(399, 429), 'Below Market Reference')
    assert.equal(pricingPosition(185, null), 'Insufficient Data')
  })
  test('suggested range never drops below a 15% gross margin', () => {
    const range = suggestedPriceRange(1249, 1060)!
    assert.ok(grossMargin(range.min, 1060) >= 0.15)
    assert.equal(suggestedPriceRange(null, 100), null)
  })
})

describe('customer pattern flags', () => {
  const flag = (cancelledOrders: number, returnedOrders: number, duplicateOrderCancellations = 0) =>
    customerPatternFlag({ totalOrders: 6, cancelledOrders, returnedOrders, duplicateOrderCancellations })
  test('flags only what the counts show', () => {
    assert.equal(flag(0, 0), 'Normal')
    assert.equal(flag(4, 0), 'Repeated Cancellations')
    assert.equal(flag(0, 3), 'Repeated Returns')
    assert.equal(flag(2, 2), 'Requires Human Review')
    assert.equal(flag(2, 0, 2), 'Frequent Order Changes')
    assert.equal(flag(1, 1), 'Normal')
  })
})
