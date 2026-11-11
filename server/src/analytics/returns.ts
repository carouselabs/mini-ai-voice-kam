import type { ReturnAnalysis } from '../../../shared/analytics.ts'
import { isDeliveredOrder, ordersIn, productName, returnsIn, type Store } from '../data/store.ts'
import { breakdown, compare, compareRates, shares, weekLabel, weekStart } from './compare.ts'
import { istDate, ratioOrZero, round, sum } from './math.ts'

export const RETURN_DEFINITION =
  'Return rate = returns on orders placed in the month ÷ orders from that month that were delivered (including ones later returned).'

export const QUALITY_REASONS = ['Product Defect', 'Quality Not as Expected'] as const
export const EXPECTATION_REASONS = ['Size Issue', 'Colour Mismatch', 'Different From Description'] as const

export function getReturnAnalysis(store: Store): ReturnAnalysis {
  const prevDelivered = ordersIn(store, 'previous').filter(isDeliveredOrder)
  const curDelivered = ordersIn(store, 'current').filter(isDeliveredOrder)
  const prev = returnsIn(store, 'previous')
  const cur = returnsIn(store, 'current')

  const byProduct = store.products
    .map((p) => {
      const delivered = curDelivered.filter((o) => o.productId === p.productId).length
      const returns = cur.filter((r) => r.productId === p.productId)
      const prevProductDelivered = prevDelivered.filter((o) => o.productId === p.productId).length
      return {
        productId: p.productId,
        productName: p.productName,
        delivered,
        returns: returns.length,
        rate: round(ratioOrZero(returns.length, delivered), 6),
        previousRate: round(ratioOrZero(prev.filter((r) => r.productId === p.productId).length, prevProductDelivered), 6),
        topReason: breakdown([], returns, (r) => r.returnReason)[0]?.key ?? null,
        qualityComplaints: returns.filter((r) => r.qualityComplaint).length,
      }
    })
    .filter((row) => row.returns > 0)
    .sort((a, b) => b.rate - a.rate || b.returns - a.returns)

  const weeks = new Map<string, number>()
  for (const r of store.returns) {
    const start = weekStart(istDate(r.returnDate))
    weeks.set(start, (weeks.get(start) ?? 0) + 1)
  }

  const recentUndelivered = ordersIn(store, 'current').filter((o) => !isDeliveredOrder(o) && o.orderStatus !== 'Cancelled')

  return {
    definition: RETURN_DEFINITION,
    records: {
      previous: { returns: prev.length, delivered: prevDelivered.length },
      current: { returns: cur.length, delivered: curDelivered.length },
      rate: compareRates(
        round(ratioOrZero(prev.length, prevDelivered.length), 6),
        round(ratioOrZero(cur.length, curDelivered.length), 6),
      ),
    },
    returnValue: compare(sum(prev, (r) => r.refundAmount), sum(cur, (r) => r.refundAmount)),
    reasons: breakdown(prev, cur, (r) => r.returnReason),
    byProduct,
    conditions: shares(cur, (r) => r.returnCondition),
    refundStatus: shares(cur, (r) => r.refundStatus),
    qualityComplaints: compare(prev.filter((r) => r.qualityComplaint).length, cur.filter((r) => r.qualityComplaint).length),
    weeklyTrend: [...weeks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([start, returns]) => ({ weekStart: start, label: weekLabel(start), returns })),
    notes: [
      'Return rate is synthetic demo data; the assignment does not give one.',
      `${recentUndelivered.length} October orders were not yet delivered at the data refresh, and late-October deliveries are still inside the return window, so October’s return rate can still rise.`,
    ],
  }
}

export function getReturnReasons(store: Store, productId: string) {
  const mine = (period: 'previous' | 'current') => returnsIn(store, period).filter((r) => r.productId === productId)
  return {
    productId,
    productName: productName(store, productId),
    reasons: breakdown(mine('previous'), mine('current'), (r) => r.returnReason),
    records: [...mine('previous'), ...mine('current')],
  }
}
