import type { InventoryAnalysis, InventoryRiskItem } from '../../../shared/analytics.ts'
import type { InventoryRecord } from '../../../shared/records.ts'
import type { Store } from '../data/store.ts'
import { compare } from './compare.ts'
import { runsOutBeforeReplenishment } from './inventory-rules.ts'
import { daysBetween, istDate, round, sum } from './math.ts'

/** Calendar days the SKU was out of stock inside the current period. */
export function daysOutOfStockInPeriod(store: Store, record: InventoryRecord): number {
  if (!record.stockoutDate) return 0
  const { start, end } = store.manifest.periods.current
  const from = record.stockoutDate >= start ? record.stockoutDate : start
  const fromNextDay = record.stockoutDate >= start ? 1 : 0
  return Math.max(0, Math.round(daysBetween(`${from}T00:00:00Z`, `${end}T00:00:00Z`)) + 1 - fromNextDay)
}

/** Orders placed per in-stock day (demand, including orders later cancelled), used for lost-sales estimates. */
export function demandPerDay(store: Store, record: InventoryRecord): number {
  const { previous, current } = store.manifest.periods
  const window = (period: typeof current) => {
    const last = record.stockoutDate && record.stockoutDate < period.end ? record.stockoutDate : period.end
    return last < period.start ? 0 : Math.round(daysBetween(`${period.start}T00:00:00Z`, `${last}T00:00:00Z`)) + 1
  }
  const placed = (key: 'previous' | 'current') =>
    store.orders.filter((o) => o.period === key && o.sku === record.sku).length
  const currentDays = window(current)
  if (currentDays > 0) return round(placed('current') / currentDays, 3)
  const previousDays = window(previous)
  return previousDays > 0 ? round(placed('previous') / previousDays, 3) : 0
}

export function riskItem(store: Store, record: InventoryRecord): InventoryRiskItem {
  const product = store.index.product.get(record.productId)!
  const supplier = store.index.supplier.get(product.supplierId)
  const daysOut = daysOutOfStockInPeriod(store, record)
  const demand = demandPerDay(store, record)
  const lostOrders = round(demand * daysOut, 1)
  const atRisk = runsOutBeforeReplenishment(record)
  const outOfStock = record.availableStock === 0
  const coverGap = record.estimatedDaysRemaining === null ? 0 : Math.max(0, record.supplierLeadTimeDays - record.estimatedDaysRemaining)
  // Monthly sales at risk: in-stock demand × price × 30 days. Halved when a restock is already on the way;
  // for SKUs still in stock, scaled by how much of the lead time the remaining stock fails to cover.
  const monthlyDemandValue = demand * product.sellingPrice * 30
  const priorityScore = round(
    outOfStock
      ? monthlyDemandValue * (record.inTransitStock > 0 ? 0.5 : 1)
      : atRisk
        ? monthlyDemandValue * (coverGap / record.supplierLeadTimeDays)
        : 0,
    0,
  )
  return {
    sku: record.sku,
    productId: record.productId,
    productName: product.productName,
    variantLabel: record.variantLabel,
    inventoryStatus: record.inventoryStatus,
    availableStock: record.availableStock,
    averageDailySales: record.averageDailySales,
    estimatedDaysRemaining: record.estimatedDaysRemaining,
    supplierLeadTimeDays: record.supplierLeadTimeDays,
    inTransitStock: record.inTransitStock,
    expectedRestockDate: record.expectedRestockDate,
    stockoutDate: record.stockoutDate,
    daysOutOfStock: daysOut,
    estimatedLostOrders: lostOrders,
    estimatedLostSales: round(lostOrders * product.sellingPrice, 0),
    runsOutBeforeReplenishment: atRisk,
    supplierName: supplier?.supplierName ?? 'Unknown supplier',
    supplierStatus: supplier?.supplierStatus ?? 'Unknown',
    priorityScore,
  }
}

export function getInventoryAnalysis(store: Store): InventoryAnalysis {
  const items = store.inventory.map((record) => riskItem(store, record))
  const count = (status: InventoryRecord['inventoryStatus']) =>
    store.inventory.filter((i) => i.inventoryStatus === status).length
  const outOfStock = items.filter((i) => i.availableStock === 0).sort((a, b) => b.priorityScore - a.priorityScore)
  const atRisk = items
    .filter((i) => i.availableStock > 0 && (i.runsOutBeforeReplenishment || i.inventoryStatus === 'Critical'))
    .sort((a, b) => (a.estimatedDaysRemaining ?? Infinity) - (b.estimatedDaysRemaining ?? Infinity))
  const facts = store.facts.metrics.outOfStockProducts

  return {
    facts: compare(facts.previous, facts.current),
    totals: {
      activeSkus: store.inventory.length,
      outOfStock: outOfStock.length,
      outOfStockPrevious: store.inventory.filter((i) => i.outOfStockAtPreviousPeriodEnd).length,
      replenishmentPending: count('Replenishment Pending'),
      critical: count('Critical'),
      lowStock: count('Low Stock'),
      healthy: count('Healthy'),
    },
    inventoryValue: sum(store.inventory, (i) => i.availableStock * (store.index.product.get(i.productId)?.costPrice ?? 0)),
    outOfStock,
    atRisk,
    replenishmentPriority: [...outOfStock, ...atRisk].sort((a, b) => b.priorityScore - a.priorityScore),
    stockoutHistory: store.inventory
      .filter((i) => i.stockoutDate)
      .map((i) => ({
        date: i.stockoutDate!,
        sku: i.sku,
        productName: store.index.product.get(i.productId)?.productName ?? i.productId,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
}

/** Inventory records with day-level context, for tables. */
export function inventoryWithContext(store: Store) {
  return store.inventory.map((record) => {
    const product = store.index.product.get(record.productId)!
    return {
      ...record,
      productName: product.productName,
      supplierId: product.supplierId,
      supplierName: store.index.supplier.get(product.supplierId)?.supplierName ?? product.supplierId,
      lastRestockedDate: istDate(record.lastRestockedAt),
      runsOutBeforeReplenishment: runsOutBeforeReplenishment(record),
    }
  })
}
