import type { PerformanceStatus, ProductAnalysis, ProductPerformanceRow } from '../../../shared/analytics.ts'
import type { Product } from '../../../shared/records.ts'
import { isDeliveredOrder, ordersIn, returnsIn, type Store } from '../data/store.ts'
import { grossMargin } from './pricing-rules.ts'
import { percentChange, ratioOrZero, round, sum } from './math.ts'

export const PRODUCT_THRESHOLDS = {
  /** Revenue change at or below this is "declining". */
  declining: -0.2,
  minPreviousRevenue: 2000,
  highCancellation: 0.2,
  highReturn: 0.2,
  /** Minimum orders (or deliveries) before a product rate is trusted. */
  minOrders: 5,
  lowRating: 3.6,
  lowConversion: 0.01,
  minViewsForConversion: 800,
  /** High-views/low-conversion: views ≥ 1.5 × median and conversion ≤ 0.5 × median. */
  highViewsMultiple: 1.5,
  lowConversionMultiple: 0.5,
  /** High-conversion/low-visibility: conversion ≥ 1.5 × median and impressions ≤ 0.5 × median. */
  highConversionMultiple: 1.5,
  lowVisibilityMultiple: 0.5,
  thinMargin: 0.2,
} as const

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function baseRow(store: Store, product: Product): Omit<ProductPerformanceRow, 'performanceStatus' | 'flags'> {
  const prev = ordersIn(store, 'previous').filter((o) => o.productId === product.productId)
  const cur = ordersIn(store, 'current').filter((o) => o.productId === product.productId)
  const delivered = cur.filter(isDeliveredOrder).length
  const returns = returnsIn(store, 'current').filter((r) => r.productId === product.productId).length
  const revenue = sum(cur, (o) => o.totalAmount)
  const previousRevenue = sum(prev, (o) => o.totalAmount)
  return {
    productId: product.productId,
    productName: product.productName,
    sku: product.sku,
    category: product.category,
    sellingPrice: product.sellingPrice,
    availableStock: product.availableStock,
    listingStatus: product.listingStatus,
    orders: cur.length,
    previousOrders: prev.length,
    revenue,
    previousRevenue,
    revenueChange: revenue - previousRevenue,
    revenuePercentChange: percentChange(previousRevenue, revenue),
    conversionRate: round(ratioOrZero(cur.length, product.productViews), 4),
    previousConversionRate: round(ratioOrZero(prev.length, product.previousPeriodProductViews), 4),
    impressions: product.impressions,
    previousImpressions: product.previousPeriodImpressions,
    productViews: product.productViews,
    cancellationRate: round(ratioOrZero(cur.filter((o) => o.orderStatus === 'Cancelled').length, cur.length), 4),
    returnRate: round(ratioOrZero(returns, delivered), 4),
    rating: product.rating,
    grossMargin: grossMargin(product.sellingPrice, product.costPrice),
  }
}

export function getProductAnalysis(store: Store): ProductAnalysis {
  const T = PRODUCT_THRESHOLDS
  const base = store.products.map((p) => ({ product: p, row: baseRow(store, p) }))
  const medViews = median(base.map((b) => b.row.productViews))
  const medConversion = median(base.map((b) => b.row.conversionRate))
  const medImpressions = median(base.map((b) => b.row.impressions))
  const medRevenue = median(base.map((b) => b.row.revenue))
  const topRevenueIds = new Set([...base].sort((a, b) => b.row.revenue - a.row.revenue).slice(0, 3).map((b) => b.product.productId))

  const rows: ProductPerformanceRow[] = base.map(({ product, row }) => {
    const delivered = ordersIn(store, 'current').filter((o) => o.productId === product.productId && isDeliveredOrder(o)).length
    const skus = store.inventory.filter((i) => i.productId === product.productId)
    const tests = {
      declining: row.revenuePercentChange !== null && row.revenuePercentChange <= T.declining && row.previousRevenue >= T.minPreviousRevenue,
      highCancellation: row.orders >= T.minOrders && row.cancellationRate >= T.highCancellation,
      highReturn: delivered >= T.minOrders && row.returnRate >= T.highReturn,
      lowRating: row.rating < T.lowRating,
      lowConversion: row.productViews >= T.minViewsForConversion && row.conversionRate < T.lowConversion,
      highViewsLowConversion:
        row.productViews >= medViews * T.highViewsMultiple && row.conversionRate <= medConversion * T.lowConversionMultiple,
      highConversionLowVisibility:
        row.conversionRate >= medConversion * T.highConversionMultiple && row.impressions <= medImpressions * T.lowVisibilityMultiple,
      thinMargin: row.revenue >= medRevenue && row.grossMargin < T.thinMargin,
      partiallyOut: product.listingStatus === 'Partially Out of Stock',
      lowStock: skus.some((s) => s.inventoryStatus === 'Critical' || s.inventoryStatus === 'Low Stock'),
    }
    const flags = [
      tests.declining && 'Declining revenue',
      tests.highCancellation && 'High cancellations',
      tests.highReturn && 'High returns',
      tests.lowRating && 'Low rating',
      tests.lowConversion && 'Low conversion',
      tests.highViewsLowConversion && 'High views, low conversion',
      tests.highConversionLowVisibility && 'Low visibility, high conversion',
      tests.thinMargin && 'Thin margin',
      tests.partiallyOut && 'Some sizes or colours out of stock',
      tests.lowStock && 'Low stock',
    ].filter((f): f is string => Boolean(f))

    const performanceStatus: PerformanceStatus =
      product.listingStatus === 'Out of Stock'
        ? 'Out of stock'
        : tests.declining
          ? 'Declining'
          : tests.highCancellation || tests.highReturn || tests.lowRating
            ? 'Needs attention'
            : tests.partiallyOut || tests.lowStock
              ? 'At risk'
              : topRevenueIds.has(product.productId)
                ? 'Top performer'
                : 'Healthy'

    return { ...row, performanceStatus, flags }
  })

  const where = (flag: string) => rows.filter((r) => r.flags.includes(flag))
  return {
    rows,
    topByRevenue: [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    topByOrders: [...rows].sort((a, b) => b.orders - a.orders).slice(0, 5),
    declining: where('Declining revenue').sort((a, b) => a.revenueChange - b.revenueChange),
    highCancellation: where('High cancellations').sort((a, b) => b.cancellationRate - a.cancellationRate),
    highReturn: where('High returns').sort((a, b) => b.returnRate - a.returnRate),
    lowConversion: where('Low conversion').sort((a, b) => a.conversionRate - b.conversionRate),
    highViewsLowConversion: where('High views, low conversion'),
    highConversionLowVisibility: where('Low visibility, high conversion'),
    highRevenueLowMargin: where('Thin margin'),
    thresholds: { ...T, medianViews: medViews, medianConversion: medConversion, medianImpressions: medImpressions },
  }
}

/** One product with everything linked to it, for detail views and the assistant. */
export function getProductPerformance(store: Store, productId: string) {
  const product = store.index.product.get(productId)
  if (!product) return null
  const analysis = getProductAnalysis(store)
  return {
    product,
    performance: analysis.rows.find((r) => r.productId === productId)!,
    inventory: store.inventory.filter((i) => i.productId === productId),
    pricing: store.index.pricing.get(productId) ?? null,
    supplier: store.index.supplier.get(product.supplierId) ?? null,
    reviews: store.reviews.filter((r) => r.productId === productId),
    cancellations: store.cancellations.filter((c) => c.productId === productId),
    returns: store.returns.filter((r) => r.productId === productId),
  }
}
