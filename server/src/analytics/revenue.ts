import type { DailyPoint, OrdersAnalysis, RevenueAnalysis } from '../../../shared/analytics.ts'
import { formatCurrency, formatCount, formatPercent } from '../../../shared/format.ts'
import type { Discrepancy } from '../../../shared/insights.ts'
import type { Order, PeriodKey } from '../../../shared/records.ts'
import { ordersIn, type Store } from '../data/store.ts'
import { compare, shares, weekLabel, weekStart } from './compare.ts'
import { istDate, round, safeDivide, sum } from './math.ts'

export const SALES_DEFINITION =
  'Sales = gross value of orders placed in the month, including orders later cancelled or returned (the assignment’s definition: ₹1,35,000 ÷ 270 orders = ₹500).'

const gross = (orders: readonly Order[]) => sum(orders, (o) => o.totalAmount)
const units = (orders: readonly Order[]) => sum(orders, (o) => o.quantity)
const net = (orders: readonly Order[]) =>
  gross(orders.filter((o) => o.orderStatus !== 'Cancelled' && o.orderStatus !== 'Returned' && o.orderStatus !== 'Return Requested'))

export function dailyTrend(store: Store): DailyPoint[] {
  const byDay = (period: PeriodKey) => {
    const map = new Map<string, Order[]>()
    for (const o of ordersIn(store, period)) {
      const day = istDate(o.orderDate)
      map.set(day, [...(map.get(day) ?? []), o])
    }
    return map
  }
  const prev = byDay('previous')
  const cur = byDay('current')
  const { previous, current } = store.manifest.periods
  const dayCount = (p: { start: string; end: string }) => Number(p.end.slice(8)) - Number(p.start.slice(8)) + 1
  const days = Math.max(dayCount(previous), dayCount(current))
  return Array.from({ length: days }, (_, i) => {
    const day = i + 1
    const dateIn = (p: { start: string; end: string }) =>
      day <= dayCount(p) ? `${p.start.slice(0, 8)}${String(day).padStart(2, '0')}` : null
    const previousDate = dateIn(previous)
    const currentDate = dateIn(current)
    const prevOrders = previousDate ? (prev.get(previousDate) ?? []) : null
    const curOrders = currentDate ? (cur.get(currentDate) ?? []) : null
    return {
      day,
      previousDate,
      currentDate,
      previousRevenue: prevOrders ? gross(prevOrders) : null,
      currentRevenue: curOrders ? gross(curOrders) : null,
      previousOrders: prevOrders ? prevOrders.length : null,
      currentOrders: curOrders ? curOrders.length : null,
    }
  })
}

/** Compares the assignment's figures with what the records add up to. */
export function reconcile(store: Store): Discrepancy[] {
  const f = store.facts.metrics
  const prev = ordersIn(store, 'previous')
  const cur = ordersIn(store, 'current')
  const cancelled = (p: PeriodKey) => store.cancellations.filter((c) => c.period === p).length
  const rows: Discrepancy[] = []
  const add = (topic: string, a: number, r: number, format: (n: number) => string, tolerance = 0) =>
    rows.push({
      topic,
      assignmentValue: format(a),
      recordsValue: format(r),
      withinRounding: Math.abs(a - r) <= tolerance,
      note:
        a === r
          ? 'Records match the assignment exactly.'
          : Math.abs(a - r) <= tolerance
            ? 'Matches the assignment after rounding.'
            : 'Records differ from the assignment. The assignment figure is shown as the headline.',
    })
  add('Sales, September', f.sales.previous, gross(prev), formatCurrency)
  add('Sales, October', f.sales.current, gross(cur), formatCurrency)
  add('Orders, September', f.orders.previous, prev.length, formatCount)
  add('Orders, October', f.orders.current, cur.length, formatCount)
  add('Cancellation rate, September', f.cancellationRate.previous, round(cancelled('previous') / prev.length, 4), formatPercent, 0.005)
  add('Cancellation rate, October', f.cancellationRate.current, round(cancelled('current') / cur.length, 4), formatPercent, 0.005)
  add('Out-of-stock SKUs, September', f.outOfStockProducts.previous, store.inventory.filter((i) => i.outOfStockAtPreviousPeriodEnd).length, formatCount)
  add('Out-of-stock SKUs, October', f.outOfStockProducts.current, store.inventory.filter((i) => i.availableStock === 0).length, formatCount)
  return rows
}

export function getRevenueAnalysis(store: Store): RevenueAnalysis {
  const prev = ordersIn(store, 'previous')
  const cur = ordersIn(store, 'current')
  const f = store.facts.metrics
  const asp = (orders: readonly Order[]) => round(safeDivide(gross(orders), units(orders)) ?? 0, 2)
  const aov = (orders: readonly Order[]) => round(safeDivide(gross(orders), orders.length) ?? 0, 2)

  const byProduct = store.products
    .map((p) => {
      const pPrev = prev.filter((o) => o.productId === p.productId)
      const pCur = cur.filter((o) => o.productId === p.productId)
      return {
        productId: p.productId,
        productName: p.productName,
        category: p.category,
        orders: compare(pPrev.length, pCur.length),
        ...compare(gross(pPrev), gross(pCur)),
      }
    })
    .sort((a, b) => a.change - b.change)

  const categories = [...new Set(store.products.map((p) => p.category))]
  const byCategory = categories.map((category) => {
    const inCat = (orders: readonly Order[]) =>
      orders.filter((o) => store.index.product.get(o.productId)?.category === category)
    return { category, ...compare(gross(inCat(prev)), gross(inCat(cur))) }
  })

  const weeks = new Map<string, Order[]>()
  for (const o of store.orders) {
    const start = weekStart(istDate(o.orderDate))
    weeks.set(start, [...(weeks.get(start) ?? []), o])
  }

  return {
    definition: SALES_DEFINITION,
    facts: {
      sales: compare(f.sales.previous, f.sales.current),
      orders: compare(f.orders.previous, f.orders.current),
      averageSellingPrice: compare(f.averageSellingPrice.previous, f.averageSellingPrice.current),
    },
    records: {
      sales: compare(gross(prev), gross(cur)),
      orders: compare(prev.length, cur.length),
      averageSellingPrice: compare(asp(prev), asp(cur)),
      averageOrderValue: compare(aov(prev), aov(cur)),
      unitsSold: compare(units(prev), units(cur)),
      netSales: compare(net(prev), net(cur)),
    },
    byCategory,
    byProduct,
    dailyTrend: dailyTrend(store),
    weeklyTrend: [...weeks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([start, list]) => ({ weekStart: start, label: weekLabel(start), revenue: gross(list), orders: list.length })),
    monthlyTrend: (['previous', 'current'] as const).map((period) => ({
      period,
      label: store.manifest.periods[period].label,
      revenue: gross(ordersIn(store, period)),
      orders: ordersIn(store, period).length,
    })),
    discrepancies: reconcile(store),
  }
}

export function getOrdersAnalysis(store: Store): OrdersAnalysis {
  const prev = ordersIn(store, 'previous')
  const cur = ordersIn(store, 'current')
  const methods = ['Prepaid', 'COD'] as const
  return {
    orders: compare(prev.length, cur.length),
    statusDistribution: shares(cur, (o) => o.orderStatus),
    fulfilmentDistribution: shares(cur, (o) => o.fulfilmentStatus),
    paymentMix: methods.map((m) => ({
      key: m,
      previous: prev.filter((o) => o.paymentMethod === m).length,
      current: cur.filter((o) => o.paymentMethod === m).length,
    })),
    openOrders: cur.filter((o) => ['New', 'Confirmed', 'Processing', 'Ready to Ship', 'Shipped'].includes(o.orderStatus))
      .length,
    dailyTrend: dailyTrend(store),
  }
}
