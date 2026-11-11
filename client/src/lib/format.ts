import type { KpiMetric } from '../../../shared/analytics.ts'
import {
  formatCount,
  formatCurrency,
  formatPercent,
  formatPercentChange,
  formatPointChange,
} from '../../../shared/format.ts'

export * from '../../../shared/format.ts'

const compactCurrency = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 1,
})

/** ₹1.4L, ₹12K: for chart axes. */
export const formatCompactCurrency = (value: number) => compactCurrency.format(value)

export function formatKpiValue(metric: Pick<KpiMetric, 'unit'>, value: number): string {
  if (metric.unit === 'currency') return formatCurrency(value)
  if (metric.unit === 'percent') return formatPercent(value)
  return formatCount(value)
}

/** Rates change in percentage points; amounts and counts change in percent. */
export function formatKpiChange(metric: KpiMetric): string {
  if (metric.direction === 'flat') return 'No change'
  if (metric.unit === 'percent' && metric.pointChange !== null) return formatPointChange(metric.pointChange)
  return metric.percentChange === null ? '' : formatPercentChange(metric.percentChange)
}

export function describeKpiChange(metric: KpiMetric, previousLabel: string): string {
  if (metric.direction === 'flat') return `No change compared with ${previousLabel}.`
  const magnitude = formatKpiChange(metric).replace(/^[+−]/, '')
  return `${metric.direction === 'up' ? 'Up' : 'Down'} ${magnitude} compared with ${previousLabel}, ${
    metric.tone === 'positive' ? 'an improvement' : 'a decline'
  }.`
}

/** "UrbanCart Fashion & Lifestyle" → "UF" */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}
