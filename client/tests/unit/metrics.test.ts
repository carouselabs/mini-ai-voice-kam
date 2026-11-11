import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { KpiMetric } from '../../../shared/analytics.ts'
import {
  formatCurrency,
  formatCurrencyChange,
  formatPercent,
  formatPercentChange,
  formatPointChange,
} from '../../../shared/format.ts'
import { describeKpiChange, formatCompactCurrency, formatKpiChange, formatKpiValue, initialsOf } from '../../src/lib/format.ts'

const kpi = (overrides: Partial<KpiMetric>): KpiMetric => ({
  key: 'sales',
  label: 'Total sales',
  unit: 'currency',
  previous: 200_000,
  current: 135_000,
  change: -65_000,
  percentChange: -0.325,
  pointChange: null,
  direction: 'down',
  polarity: 'higher-is-better',
  tone: 'negative',
  source: 'assignment_provided',
  recordsValue: null,
  note: '',
  ...overrides,
})

describe('shared formatting', () => {
  test('rupees use Indian digit grouping', () => {
    assert.equal(formatCurrency(135_000), '₹1,35,000')
    assert.equal(formatCurrencyChange(-65_000), '−₹65,000')
    assert.equal(formatCompactCurrency(135_000), '₹1.4L')
  })
  test('percentages and changes', () => {
    assert.equal(formatPercent(0.14), '14%')
    assert.equal(formatPercentChange(-0.325), '−32.5%')
    assert.equal(formatPointChange(6), '+6 pts')
  })
})

describe('KPI display', () => {
  test('amounts change in percent', () => {
    const sales = kpi({})
    assert.equal(formatKpiValue(sales, sales.current), '₹1,35,000')
    assert.equal(formatKpiChange(sales), '−32.5%')
    assert.equal(describeKpiChange(sales, 'Sep 2026'), 'Down 32.5% compared with Sep 2026, a decline.')
  })
  test('rates change in percentage points', () => {
    const rate = kpi({ key: 'cancellationRate', unit: 'percent', previous: 0.08, current: 0.14, pointChange: 6, direction: 'up', polarity: 'lower-is-better' })
    assert.equal(formatKpiValue(rate, rate.current), '14%')
    assert.equal(formatKpiChange(rate), '+6 pts')
  })
  test('no change reads as such', () => {
    assert.equal(formatKpiChange(kpi({ direction: 'flat', change: 0, percentChange: 0, tone: 'neutral' })), 'No change')
  })
})

describe('seller initials', () => {
  test('first letters of the first two words', () => {
    assert.equal(initialsOf('UrbanCart Fashion & Lifestyle'), 'UF')
    assert.equal(initialsOf('Sharma Retail'), 'SR')
  })
})
