import type { Alert, KpiMetric, OverviewData, Polarity } from '../../../shared/analytics.ts'
import { formatCurrency, formatDate, formatDecimal, formatPercent } from '../../../shared/format.ts'
import type { SourceType } from '../../../shared/records.ts'
import { ordersIn, type Store } from '../data/store.ts'
import type { Context } from '../insights/context.ts'
import { compare, compareRates, toneFor } from './compare.ts'
import { round } from './math.ts'

function kpi(
  key: KpiMetric['key'],
  label: string,
  unit: KpiMetric['unit'],
  previous: number,
  current: number,
  polarity: Polarity,
  source: SourceType,
  note: string,
  recordsValue: KpiMetric['recordsValue'] = null,
): KpiMetric {
  const isRate = unit === 'percent'
  const comparison = compare(previous, current)
  const rate = isRate ? compareRates(previous, current) : null
  const direction = rate ? rate.direction : comparison.direction
  return {
    key,
    label,
    unit,
    previous,
    current,
    change: comparison.change,
    percentChange: comparison.percentChange,
    pointChange: rate ? rate.pointChange : null,
    direction,
    polarity,
    tone: toneFor(direction, polarity),
    source,
    recordsValue,
    note,
  }
}

export function getKpis(ctx: Context): KpiMetric[] {
  const { store } = ctx
  const f = store.facts.metrics
  const rec = ctx.revenue.records
  const cancel = ctx.cancellations.records.rate
  const returns = ctx.returns.records.rate
  return [
    kpi('sales', 'Total sales', 'currency', f.sales.previous, f.sales.current, 'higher-is-better', 'assignment_provided',
      'Gross value of orders placed (assignment figure).', { previous: rec.sales.previous, current: rec.sales.current }),
    kpi('orders', 'Total orders', 'count', f.orders.previous, f.orders.current, 'higher-is-better', 'assignment_provided',
      'Orders placed (assignment figure).', { previous: rec.orders.previous, current: rec.orders.current }),
    kpi('averageOrderValue', 'Average order value', 'currency', f.averageSellingPrice.previous, f.averageSellingPrice.current,
      'higher-is-better', 'assignment_provided', 'Sales ÷ orders. One unit per order, so it equals the assignment’s average selling price.',
      { previous: rec.averageOrderValue.previous, current: rec.averageOrderValue.current }),
    kpi('cancellationRate', 'Cancellation rate (overall)', 'percent', f.cancellationRate.previous, f.cancellationRate.current,
      'lower-is-better', 'assignment_provided', 'All cancellations, whoever started them (customer, seller or marketplace), ÷ orders placed (assignment figure). Not a seller-side figure.',
      { previous: cancel.previous, current: cancel.current }),
    kpi('returnRate', 'Return rate', 'percent', returns.previous, returns.current, 'lower-is-better', 'synthetic_demo',
      'Returns ÷ delivered orders. Synthetic: not in the assignment.'),
    // The assignment calls these "out-of-stock products", but they are counted per SKU (size or colour variant).
    // The label says so, because "18 of 20 products" (the catalogue size) would be wrong.
    kpi('outOfStockProducts', 'Out-of-stock SKUs (variants)', 'count', f.outOfStockProducts.previous, f.outOfStockProducts.current,
      'lower-is-better', 'assignment_provided',
      `${ctx.inventory.totals.outOfStock} of ${ctx.inventory.totals.activeSkus} SKUs (sizes or colours) have no stock; ${new Set(ctx.inventory.outOfStock.map((i) => i.productId)).size} of ${ctx.store.products.length} products have at least one variant out of stock. The assignment calls these "out-of-stock products".`, {
        previous: ctx.inventory.totals.outOfStockPrevious,
        current: ctx.inventory.totals.outOfStock,
      }),
  ]
}

export function getAlerts(ctx: Context): Alert[] {
  const alerts: Alert[] = []
  const inv = ctx.inventory
  const noPo = inv.outOfStock.filter((i) => i.inTransitStock === 0)
  if (noPo.length) {
    alerts.push({
      id: 'ALERT-INV-1',
      category: 'inventory',
      severity: 'critical',
      title: `${noPo.length} out-of-stock SKUs have no restock on the way`,
      detail: `Including ${noPo.slice(0, 2).map((i) => `${i.productName} (${i.variantLabel})`).join(' and ')}. About ${formatCurrency(noPo.reduce((s, i) => s + i.estimatedLostSales, 0))} of estimated sales missed in October.`,
      productIds: [...new Set(noPo.map((i) => i.productId))],
    })
  }
  for (const item of inv.atRisk.slice(0, 2)) {
    alerts.push({
      id: `ALERT-INV-${item.sku}`,
      category: 'inventory',
      severity: 'high',
      title: `${item.productName} runs out in about ${formatDecimal(item.estimatedDaysRemaining ?? 0)} days`,
      detail: `${item.availableStock} left at ${formatDecimal(item.averageDailySales)} a day; a reorder takes ${item.supplierLeadTimeDays} days.`,
      productIds: [item.productId],
    })
  }
  const c = ctx.cancellations
  const topReason = c.reasons.filter((r) => r.change > 0)[0]
  if (topReason) {
    alerts.push({
      id: 'ALERT-CAN-1',
      category: 'cancellations',
      severity: 'high',
      title: `Overall cancellation rate up to ${formatPercent(c.facts.current)}`,
      detail: `“${topReason.key}” cancellations went from ${topReason.previous} to ${topReason.current}. Seller-initiated: ${c.initiators.find((i) => i.key === 'Seller')?.previous ?? 0} → ${c.initiators.find((i) => i.key === 'Seller')?.current ?? 0} orders.`,
      productIds: c.byProduct.slice(0, 3).map((p) => p.productId),
    })
  }
  const worstReturn = ctx.returns.byProduct.find((p) => p.qualityComplaints >= 2)
  if (worstReturn) {
    alerts.push({
      id: 'ALERT-RET-1',
      category: 'returns',
      severity: 'high',
      title: `${worstReturn.productName}: ${formatPercent(worstReturn.rate)} returned`,
      detail: `${worstReturn.qualityComplaints} quality complaints in October returns.`,
      productIds: [worstReturn.productId],
    })
  }
  if (ctx.delivery.late.current > ctx.delivery.late.previous) {
    alerts.push({
      id: 'ALERT-DEL-1',
      category: 'delivery',
      severity: 'medium',
      title: `${ctx.delivery.late.current} late deliveries (was ${ctx.delivery.late.previous})`,
      detail: ctx.delivery.bottleneck.note,
      productIds: ctx.delivery.slowestProducts.slice(0, 3).map((p) => p.productId),
    })
  }
  const delayed = ctx.store.suppliers.filter((s) => s.supplierStatus === 'Delayed')
  for (const s of delayed) {
    alerts.push({
      id: `ALERT-SUP-${s.supplierId}`,
      category: 'inventory',
      severity: 'medium',
      title: `${s.supplierName} restock delayed`,
      detail: s.expectedRestockDate ? `Now expected ${formatDate(s.expectedRestockDate)}.` : 'No new date given.',
      productIds: s.suppliedProducts,
    })
  }
  return alerts
}

export function getOverview(ctx: Context): OverviewData {
  const { store } = ctx
  const recent = [...ordersIn(store, 'current')].sort((a, b) => b.orderDate.localeCompare(a.orderDate)).slice(0, 8)
  const inv = ctx.inventory.totals
  return {
    kpis: getKpis(ctx),
    dailyTrend: ctx.revenue.dailyTrend,
    statusDistribution: ctx.orders.statusDistribution,
    topProducts: ctx.products.topByRevenue,
    decliningProducts: ctx.products.declining.slice(0, 5),
    alerts: getAlerts(ctx),
    recentOrders: recent.map((o) => ({
      orderId: o.orderId,
      orderDate: o.orderDate,
      productId: o.productId,
      productName: store.index.product.get(o.productId)?.productName ?? o.productId,
      sku: o.sku,
      totalAmount: o.totalAmount,
      orderStatus: o.orderStatus,
      paymentMethod: o.paymentMethod,
    })),
    inventory: {
      outOfStock: inv.outOfStock,
      lowStock: inv.lowStock,
      critical: inv.critical,
      replenishmentPending: inv.replenishmentPending,
      healthy: inv.healthy,
      activeSkus: inv.activeSkus,
    },
    cancellations: { rate: ctx.cancellations.facts, topReasons: ctx.cancellations.reasons.slice(0, 4) },
    returns: { rate: ctx.returns.records.rate, topReasons: ctx.returns.reasons.slice(0, 4) },
    discrepancies: ctx.revenue.discrepancies,
  }
}

/** Freshness against the monthly refresh window. */
export function freshness(store: Store, now = Date.now()): 'current' | 'stale' {
  const ageDays = (now - Date.parse(store.manifest.lastUpdatedAt)) / 86_400_000
  return round(ageDays, 2) <= store.manifest.freshnessWindowDays ? 'current' : 'stale'
}
