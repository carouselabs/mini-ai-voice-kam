/**
 * Data access for the Virtual KAM (the AI arrives in the next milestone).
 *
 * Data-awareness contract:
 * 1. Look in the data before asking the seller.
 * 2. If something is not in the data, say so (available: false) instead of guessing.
 * 3. Always include when the data was last updated and whether it is still current.
 * 4. Flag any difference between assignment figures and records.
 * 5. Findings carry their evidence; uncertain causes are marked as hypotheses.
 * 6. Only ask the seller what the data cannot know (see Finding.sellerQuestion).
 */
import type { Discrepancy, Investigation } from '../../../shared/insights.ts'
import type { Period, SourceType } from '../../../shared/records.ts'
import { getCancellationReasons } from '../analytics/cancellations.ts'
import { freshness, getOverview } from '../analytics/overview.ts'
import { getCatalogueHealth } from '../analytics/people.ts'
import { getProductPerformance as productPerformance } from '../analytics/products.ts'
import { getReturnReasons } from '../analytics/returns.ts'
import { getStore, type Store } from '../data/store.ts'
import { contextFor } from '../insights/context.ts'
import { recommendationsWithFindings, runInvestigation } from '../investigations/index.ts'

export interface AwarenessMeta {
  sources: SourceType[]
  lastUpdatedAt: string
  freshness: 'current' | 'stale'
  periods: { previous: Period; current: Period }
  discrepancies: Discrepancy[]
  notes: string[]
}

export type DataResult<T> =
  | { available: true; data: T; meta: AwarenessMeta }
  | { available: false; reason: string; meta: AwarenessMeta }

function meta(store: Store, sources: SourceType[], notes: string[] = [], discrepancies: Discrepancy[] = []): AwarenessMeta {
  return {
    sources,
    lastUpdatedAt: store.manifest.lastUpdatedAt,
    freshness: freshness(store),
    periods: store.manifest.periods,
    discrepancies: discrepancies.filter((d) => d.assignmentValue !== d.recordsValue),
    notes,
  }
}

const found = <T>(store: Store, data: T, sources: SourceType[], notes: string[] = [], discrepancies: Discrepancy[] = []): DataResult<T> => ({
  available: true,
  data,
  meta: meta(store, sources, notes, discrepancies),
})

const missing = <T>(store: Store, reason: string): DataResult<T> => ({ available: false, reason, meta: meta(store, []) })

const MIXED: SourceType[] = ['assignment_provided', 'synthetic_demo']
const SYNTHETIC: SourceType[] = ['synthetic_demo']

export function getSellerOverview(store = getStore()) {
  const ctx = contextFor(store)
  return found(store, { seller: store.seller, ...getOverview(ctx) }, MIXED, store.manifest.assumptions, ctx.revenue.discrepancies)
}

export function getSalesAnalysis(store = getStore()) {
  const ctx = contextFor(store)
  return found(store, { revenue: ctx.revenue, orders: ctx.orders }, MIXED, [ctx.revenue.definition], ctx.revenue.discrepancies)
}

export function getTopProducts(store = getStore(), limit = 5) {
  const ctx = contextFor(store)
  return found(store, { byRevenue: ctx.products.topByRevenue.slice(0, limit), byOrders: ctx.products.topByOrders.slice(0, limit) }, SYNTHETIC)
}

/** Finds products by name, SKU, ID or category so a loosely named product can be looked up. Empty query lists all. */
export function searchProducts(query: string, store = getStore()) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const rows = contextFor(store).products.rows
    .filter((r) => words.every((w) => `${r.productName} ${r.sku} ${r.productId} ${r.category}`.toLowerCase().includes(w)))
    .map((r) => ({
      productId: r.productId,
      productName: r.productName,
      category: r.category,
      sku: r.sku,
      performanceStatus: r.performanceStatus,
      listingStatus: r.listingStatus,
    }))
  return rows.length
    ? found(store, rows, SYNTHETIC)
    : missing<typeof rows>(store, `No product matches "${query}". Search with fewer words, or an empty query to list all products.`)
}

export function getProductPerformance(productId: string, store = getStore()) {
  const result = productPerformance(store, productId)
  return result ? found(store, result, SYNTHETIC) : missing<NonNullable<typeof result>>(store, `No product with ID ${productId} in the data.`)
}

export function getInventoryRisks(store = getStore()) {
  const ctx = contextFor(store)
  return found(store, ctx.inventory, MIXED, [
    'Lost orders and lost sales are estimates: in-stock order rate × days out of stock.',
    'Open purchase orders are not in the data, apart from stock already in transit.',
  ])
}

export function getCancellationAnalysis(store = getStore()) {
  const ctx = contextFor(store)
  return found(store, ctx.cancellations, MIXED, [ctx.cancellations.definition])
}

export function getCancellationReasonsFor(productId: string, store = getStore()) {
  if (!store.index.product.has(productId)) return missing<ReturnType<typeof getCancellationReasons>>(store, `No product with ID ${productId} in the data.`)
  return found(store, getCancellationReasons(store, productId), SYNTHETIC, ['Unknown reasons stay Unknown; no reason is guessed.'])
}

export function getReturnAnalysis(store = getStore()) {
  const ctx = contextFor(store)
  return found(store, ctx.returns, SYNTHETIC, [ctx.returns.definition, ...ctx.returns.notes])
}

export function getReturnReasonsFor(productId: string, store = getStore()) {
  if (!store.index.product.has(productId)) return missing<ReturnType<typeof getReturnReasons>>(store, `No product with ID ${productId} in the data.`)
  return found(store, getReturnReasons(store, productId), SYNTHETIC)
}

export function getCustomerBehaviourPatterns(store = getStore()) {
  const ctx = contextFor(store)
  return found(store, ctx.customers, SYNTHETIC, [ctx.customers.guardrail])
}

export function getDeliveryAnalysis(store = getStore()) {
  const ctx = contextFor(store)
  return found(store, ctx.delivery, SYNTHETIC, [ctx.delivery.definition])
}

export function getPricingAnalysis(store = getStore()) {
  const ctx = contextFor(store)
  return found(store, ctx.pricing, SYNTHETIC, [ctx.pricing.note])
}

export function getCatalogueHealthAnalysis(store = getStore()) {
  return found(store, getCatalogueHealth(store), SYNTHETIC)
}

export function getReviewsAnalysis(store = getStore()) {
  const ctx = contextFor(store)
  return found(store, ctx.reviews, SYNTHETIC, [ctx.reviews.note])
}

export function getProfitabilityAnalysis(store = getStore()) {
  const ctx = contextFor(store)
  return found(store, ctx.profitability, SYNTHETIC, [ctx.profitability.note])
}

const investigate = (scenario: Investigation['scenario']) => (store = getStore()) =>
  found(store, runInvestigation(store, scenario), MIXED)

export const investigateSalesDecline = investigate('sales-decline')
export const investigateCancellationSpike = investigate('cancellations')
export const investigateReturnSpike = investigate('returns')
export const investigateInventoryRisk = investigate('inventory')
export const investigateProductVisibility = investigate('visibility')
export const investigatePricing = investigate('pricing')
export const investigateEverything = investigate('overview')

export function getRecommendedActions(store = getStore()) {
  return found(store, recommendationsWithFindings(store), MIXED, [
    'Recommendations only. Mini AI does not contact suppliers, warehouse teams, customers or couriers, and every action needs the seller’s approval.',
  ])
}

/** Tool list for the assistant in the next milestone: name, purpose and arguments. */
export const KAM_TOOLS = [
  { name: 'getSellerOverview', description: 'Headline metrics, alerts and recent orders.', args: [] },
  { name: 'getSalesAnalysis', description: 'Revenue and order changes by product, category and day.', args: [] },
  { name: 'getTopProducts', description: 'Best products by revenue and by orders.', args: ['limit?'] },
  { name: 'getProductPerformance', description: 'Everything linked to one product.', args: ['productId'] },
  { name: 'getInventoryRisks', description: 'Out-of-stock and at-risk SKUs with restock priority.', args: [] },
  { name: 'getCancellationAnalysis', description: 'Cancellation rate, reasons, stages and products.', args: [] },
  { name: 'getCancellationReasons', description: 'Cancellation reasons for one product.', args: ['productId'] },
  { name: 'getReturnAnalysis', description: 'Return rate, reasons, conditions and products.', args: [] },
  { name: 'getReturnReasons', description: 'Return reasons for one product.', args: ['productId'] },
  { name: 'getCustomerBehaviourPatterns', description: 'Anonymised repeat-cancellation and repeat-return patterns (human review only).', args: [] },
  { name: 'getDeliveryAnalysis', description: 'Dispatch times, late deliveries and delivery issues.', args: [] },
  { name: 'getPricingAnalysis', description: 'Price vs cost and synthetic reference prices.', args: [] },
  { name: 'getCatalogueHealth', description: 'Listing status, low-rated and zero-order products.', args: [] },
  { name: 'getReviewsAnalysis', description: 'Recent review sentiment and issues.', args: [] },
  { name: 'getProfitabilityAnalysis', description: 'Estimated gross profit by product.', args: [] },
  { name: 'investigateSalesDecline', description: 'Evidence-backed findings on why sales fell.', args: [] },
  { name: 'investigateCancellationSpike', description: 'Evidence-backed findings on cancellations.', args: [] },
  { name: 'investigateReturnSpike', description: 'Evidence-backed findings on returns.', args: [] },
  { name: 'investigateInventoryRisk', description: 'What to restock first and why.', args: [] },
  { name: 'investigateProductVisibility', description: 'Visibility and conversion problems.', args: [] },
  { name: 'getRecommendedActions', description: 'Proposed actions with their supporting findings.', args: [] },
] as const
