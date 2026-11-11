import type { CancellationAnalysis } from '../../../shared/analytics.ts'
import type { Order } from '../../../shared/records.ts'
import { cancellationsIn, ordersIn, productName, type Store } from '../data/store.ts'
import { breakdown, compare, compareRates, weekLabel, weekStart } from './compare.ts'
import { hoursBetween, istDate, ratioOrZero, round, sum } from './math.ts'

export const CANCELLATION_DEFINITION =
  'Cancellation rate = orders placed in the month that were cancelled ÷ all orders placed in that month (same order cohort for numerator and denominator).'

export const MIN_ORDERS_FOR_PRODUCT_RATE = 5

/** Hours the order waited: until dispatch if dispatched, otherwise until cancellation or the data refresh. */
export function hoursWaiting(store: Store, order: Order): number {
  const shipment = store.index.shipmentByOrder.get(order.orderId)
  if (shipment) return shipment.sellerProcessingTime
  const cancellation = store.index.cancellationByOrder.get(order.orderId)
  if (cancellation) return cancellation.hoursToCancellation
  return hoursBetween(order.orderDate, store.manifest.lastUpdatedAt)
}

const BUCKETS = [
  { bucket: 'Under 24 hours', min: 0, max: 24 },
  { bucket: '24–48 hours', min: 24, max: 48 },
  { bucket: 'Over 48 hours', min: 48, max: Infinity },
]

export function getCancellationAnalysis(store: Store): CancellationAnalysis {
  const prevOrders = ordersIn(store, 'previous')
  const curOrders = ordersIn(store, 'current')
  const prev = cancellationsIn(store, 'previous')
  const cur = cancellationsIn(store, 'current')
  const facts = store.facts.metrics.cancellationRate

  const byProduct = store.products
    .map((p) => {
      const orders = curOrders.filter((o) => o.productId === p.productId)
      const cancelled = cur.filter((c) => c.productId === p.productId)
      const prevProductOrders = prevOrders.filter((o) => o.productId === p.productId)
      const reasons = breakdown([], cancelled, (c) => c.cancellationReason)
      return {
        productId: p.productId,
        productName: p.productName,
        orders: orders.length,
        cancelled: cancelled.length,
        rate: round(ratioOrZero(cancelled.length, orders.length), 6),
        previousRate: round(
          ratioOrZero(prev.filter((c) => c.productId === p.productId).length, prevProductOrders.length),
          4,
        ),
        topReason: reasons[0]?.key ?? null,
      }
    })
    .filter((row) => row.cancelled > 0)
    .sort((a, b) => b.rate - a.rate || b.cancelled - a.cancelled)

  const byProcessingTime = BUCKETS.map(({ bucket, min, max }) => {
    const inBucket = curOrders.filter((o) => {
      const h = hoursWaiting(store, o)
      return h >= min && h < max
    })
    const cancelled = inBucket.filter((o) => o.orderStatus === 'Cancelled').length
    return { bucket, orders: inBucket.length, cancelled, rate: round(ratioOrZero(cancelled, inBucket.length), 6) }
  })

  const weeks = new Map<string, { orders: number; cancelled: number }>()
  for (const o of store.orders) {
    const start = weekStart(istDate(o.orderDate))
    const w = weeks.get(start) ?? { orders: 0, cancelled: 0 }
    w.orders++
    if (o.orderStatus === 'Cancelled') w.cancelled++
    weeks.set(start, w)
  }

  const customerCounts = new Map<string, string[]>()
  for (const c of store.cancellations) {
    customerCounts.set(c.anonymisedCustomerId, [...(customerCounts.get(c.anonymisedCustomerId) ?? []), c.cancellationReason])
  }

  const initiators = breakdown(prev, cur, (c) => c.cancellationInitiatedBy)
  const stages = breakdown(prev, cur, (c) => c.cancellationStage)
  const shareOfOrders = (b: { previous: number; current: number }) =>
    compareRates(round(ratioOrZero(b.previous, prevOrders.length), 6), round(ratioOrZero(b.current, curOrders.length), 6))

  return {
    definition: CANCELLATION_DEFINITION,
    facts: compareRates(facts.previous, facts.current),
    // Which number is which. The overall rate counts every cancellation, whoever started it.
    breakdown: {
      overallRate: {
        label: 'Overall cancellation rate (all initiators)',
        ...compareRates(facts.previous, facts.current),
        cancelled: { previous: prev.length, current: cur.length },
        orders: { previous: prevOrders.length, current: curOrders.length },
      },
      byInitiator: initiators.map((i) => ({
        label: `${i.key}-initiated cancellations`,
        count: { previous: i.previous, current: i.current },
        shareOfOrders: shareOfOrders(i),
      })),
      byStage: stages.map((s) => ({ label: `Cancelled ${s.key.toLowerCase()}`, count: { previous: s.previous, current: s.current } })),
      note:
        'Each initiator’s share is cancellations it started ÷ all orders placed; the shares add up to the overall rate. The overall rate is not a seller-side figure: name the initiator whenever you attribute cancellations.',
    },
    records: {
      previous: { cancelled: prev.length, orders: prevOrders.length },
      current: { cancelled: cur.length, orders: curOrders.length },
      rate: compareRates(
        round(ratioOrZero(prev.length, prevOrders.length), 6),
        round(ratioOrZero(cur.length, curOrders.length), 6),
      ),
    },
    cancelledValue: compare(sum(prev, (c) => c.orderValue), sum(cur, (c) => c.orderValue)),
    reasons: breakdown(prev, cur, (c) => c.cancellationReason),
    initiators,
    stages,
    byProduct,
    byProcessingTime,
    weeklyTrend: [...weeks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([start, w]) => ({
        weekStart: start,
        label: weekLabel(start),
        orders: w.orders,
        cancelled: w.cancelled,
        rate: round(ratioOrZero(w.cancelled, w.orders), 6),
      })),
    repeatCustomers: [...customerCounts.entries()]
      .filter(([, reasons]) => reasons.length >= 2)
      .map(([anonymisedCustomerId, reasons]) => ({
        anonymisedCustomerId,
        cancellations: reasons.length,
        reasons: [...new Set(reasons)],
      }))
      .sort((a, b) => b.cancellations - a.cancellations),
  }
}

/** Cancellation reasons for one product, both periods. */
export function getCancellationReasons(store: Store, productId: string) {
  const mine = (period: 'previous' | 'current') =>
    cancellationsIn(store, period).filter((c) => c.productId === productId)
  return {
    productId,
    productName: productName(store, productId),
    reasons: breakdown(mine('previous'), mine('current'), (c) => c.cancellationReason),
    records: [...mine('previous'), ...mine('current')],
  }
}
