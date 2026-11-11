import type { ActionPriority, ActionRecommendation } from '../../../shared/insights.ts'
import { formatCurrency, formatDate, formatDecimal, formatPercent } from '../../../shared/format.ts'
import { DISPATCH_SLA_HOURS } from '../analytics/delivery.ts'
import type { Context } from './context.ts'

/**
 * Recommended actions. These are proposals only: Mini AI never contacts suppliers, warehouse
 * teams, customers or couriers, and never changes listings, prices or stock by itself.
 * Every action needs the seller's approval.
 */
export const ACTION_IDS = {
  restockOutOfStock: 'ACT-001',
  supplierFollowUp: 'ACT-002',
  restockLowCover: 'ACT-003',
  stopOverselling: 'ACT-004',
  dispatchDelays: 'ACT-005',
  inspectQuality: 'ACT-006',
  sizeGuidance: 'ACT-007',
  colourAccuracy: 'ACT-008',
  packaging: 'ACT-009',
  reviewPricing: 'ACT-010',
  protectMargin: 'ACT-011',
  boostVisibility: 'ACT-012',
  improveConversion: 'ACT-013',
  customerReview: 'ACT-014',
} as const

const DEADLINE_DAYS: Record<ActionPriority, number> = { critical: 2, high: 5, medium: 10, low: 14 }

/** Problem, metric to monitor and verification method for each action. */
const FOLLOW_UP: Record<string, { problem: string; metric: string; verification: string }> = {
  'ACT-001': { problem: 'Best-selling sizes and colours are out of stock with no restock ordered.', metric: 'Out-of-stock SKUs and orders on the restocked SKUs', verification: 'The SKUs show stock again and start receiving orders; Inventory Unavailable cancellations stop on them.' },
  'ACT-002': { problem: 'Two suppliers have missed their promised restock dates.', metric: 'Supplier expected restock dates and SKUs in Replenishment Pending', verification: 'The delayed SKUs move from Replenishment Pending to in stock by the confirmed dates.' },
  'ACT-003': { problem: 'Some in-stock SKUs will run out before a reorder can arrive.', metric: 'Days of cover versus supplier lead time on those SKUs', verification: 'Cover stays above the lead time; the SKUs never reach zero.' },
  'ACT-004': { problem: 'Orders were accepted for stock that had already run out.', metric: 'Inventory Unavailable cancellations per week', verification: 'Inventory Unavailable cancellations fall towards zero.' },
  'ACT-005': { problem: 'Some orders wait more than 48 hours before dispatch.', metric: 'Average hours to dispatch and dispatch-window breaches', verification: 'Breaches fall and Delivery Delay cancellations drop.' },
  'ACT-006': { problem: 'Returned units show repeated quality complaints.', metric: 'Quality-related returns and the product rating', verification: 'Inspection explains the defect; quality returns fall after the fix.' },
  'ACT-007': { problem: 'Customers return items because the size does not fit as expected.', metric: 'Size Issue returns on the affected listings', verification: 'Size returns fall after the size guidance changes.' },
  'ACT-008': { problem: 'Customers say items look different from the listing.', metric: 'Colour or description mismatch returns', verification: 'Mismatch returns fall after the photos or wording change.' },
  'ACT-009': { problem: 'Fragile items arrive damaged.', metric: 'Damaged During Delivery returns and damage reports', verification: 'Damage returns fall after packaging changes.' },
  'ACT-010': { problem: 'Some products are priced well above the synthetic reference and convert poorly.', metric: 'Conversion rate on the repriced products', verification: 'Conversion rises without margin falling below the minimum.' },
  'ACT-011': { problem: 'High sales on a very thin estimated margin.', metric: 'Estimated gross margin after fees on the product', verification: 'Margin after fees stays positive at the chosen price.' },
  'ACT-012': { problem: 'Products that convert well are rarely shown.', metric: 'Impressions and orders on those products', verification: 'Impressions rise and conversion holds.' },
  'ACT-013': { problem: 'Listings get many visitors but few buyers.', metric: 'Conversion rate on those listings', verification: 'Conversion moves towards the catalogue median.' },
  'ACT-014': { problem: 'A few anonymised customers show repeated cancellations or returns.', metric: 'Repeated cancellations or returns by the same anonymised customers', verification: 'An authorised reviewer has looked at the underlying orders; no customer is blocked automatically.' },
}

const cache = new WeakMap<Context, ActionRecommendation[]>()

export function getRecommendations(ctx: Context): ActionRecommendation[] {
  const cached = cache.get(ctx)
  if (cached) return cached

  const { store } = ctx
  const createdAt = store.manifest.lastUpdatedAt
  const deadline = (priority: ActionPriority) => {
    const d = new Date(createdAt)
    d.setUTCDate(d.getUTCDate() + DEADLINE_DAYS[priority])
    return d.toISOString().slice(0, 10)
  }
  const actions: ActionRecommendation[] = []
  const add = (
    a: Omit<ActionRecommendation, 'status' | 'requiresSellerApproval' | 'createdAt' | 'suggestedDeadline' | 'problem' | 'metricToMonitor' | 'verification' | 'caution'> & {
      caution?: string | null
    },
  ) =>
    actions.push({
      ...a,
      caution: a.caution ?? null,
      problem: FOLLOW_UP[a.actionId].problem,
      metricToMonitor: FOLLOW_UP[a.actionId].metric,
      verification: FOLLOW_UP[a.actionId].verification,
      status: 'proposed',
      requiresSellerApproval: true,
      createdAt,
      suggestedDeadline: deadline(a.priority),
    })
  const unique = (ids: string[]) => [...new Set(ids)]

  /* Inventory */
  const noPo = ctx.inventory.outOfStock.filter((i) => i.inTransitStock === 0)
  if (noPo.length) {
    const top = noPo.slice(0, 5)
    const qualityRisk = qualityProblemNames(ctx, noPo.map((i) => i.productId))
    add({
      actionId: ACTION_IDS.restockOutOfStock,
      title: 'Reorder out-of-stock best-sellers',
      description: `Raise purchase orders for out-of-stock SKUs that have nothing on the way, starting with ${top
        .slice(0, 3)
        .map((i) => `${i.productName} (${i.variantLabel})`)
        .join(', ')}.${qualityRisk.length ? ` Check ${qualityRisk.join(', ')} for defects before reordering (see ${ACTION_IDS.inspectQuality}).` : ''}`,
      // A second-order risk: reordering a product with confirmed defects repeats the returns.
      caution: qualityRisk.length ? `Check ${qualityRisk.join(', ')} for defects before reordering: returns show quality complaints.` : null,
      category: 'inventory',
      priority: 'critical',
      businessImpact: `About ${formatCurrency(noPo.reduce((s, i) => s + i.estimatedLostSales, 0))} of estimated lost sales in October across ${noPo.length} SKUs with no restock in transit.`,
      supportingEvidence: top.map(
        (i) => `${i.sku}: out of stock since ${formatDate(i.stockoutDate!)}, ~${formatDecimal(i.estimatedLostOrders)} orders missed`,
      ),
      findingIds: [],
      affectedProducts: unique(noPo.map((i) => i.productId)),
      suggestedOwner: 'Seller: inventory planning',
    })
  }

  const delayed = store.suppliers.filter((s) => s.supplierStatus === 'Delayed')
  if (delayed.length) {
    add({
      actionId: ACTION_IDS.supplierFollowUp,
      title: 'Follow up with delayed suppliers',
      description: `Confirm dispatch dates with ${delayed.map((s) => s.supplierName).join(' and ')}, and line up a backup source if dates slip again.`,
      category: 'supplier',
      priority: 'high',
      businessImpact: `${ctx.inventory.totals.replenishmentPending} SKUs are waiting on these restocks.`,
      supportingEvidence: delayed.map(
        (s) => `${s.supplierName}: ${s.performanceNotes}${s.expectedRestockDate ? ` Expected ${formatDate(s.expectedRestockDate)}.` : ''}`,
      ),
      findingIds: [],
      affectedProducts: unique(delayed.flatMap((s) => s.suppliedProducts)),
      suggestedOwner: 'Seller: purchasing',
    })
  }

  const lowCover = ctx.inventory.atRisk
  if (lowCover.length) {
    add({
      actionId: ACTION_IDS.restockLowCover,
      title: 'Restock items that will run out before a reorder arrives',
      description: 'Place orders now for SKUs whose remaining stock covers fewer days than the supplier’s lead time.',
      category: 'inventory',
      priority: 'high',
      businessImpact: `${lowCover.length} in-stock SKUs are likely to run out before replenishment.`,
      supportingEvidence: lowCover.map(
        (i) =>
          `${i.productName} (${i.variantLabel}): ${i.availableStock} left, ~${formatDecimal(i.estimatedDaysRemaining ?? 0)} days of cover vs ${i.supplierLeadTimeDays}-day lead time`,
      ),
      findingIds: [],
      affectedProducts: unique(lowCover.map((i) => i.productId)),
      suggestedOwner: 'Seller: inventory planning',
    })
  }

  const oversold = ctx.cancellations.reasons.find((r) => r.key === 'Inventory Unavailable')
  if (oversold && oversold.current > 0) {
    add({
      actionId: ACTION_IDS.stopOverselling,
      title: 'Keep listed stock in sync to stop overselling',
      description: 'Update stock counts more often and mark sizes or colours unavailable as soon as they run out, so customers cannot order stock that is not there.',
      category: 'listing',
      priority: 'high',
      businessImpact: `${oversold.current} October orders were cancelled because stock was unavailable (${oversold.previous} in September).`,
      supportingEvidence: [`Inventory Unavailable cancellations: ${oversold.previous} → ${oversold.current}`],
      findingIds: [],
      affectedProducts: unique(
        store.cancellations
          .filter((c) => c.period === 'current' && c.cancellationReason === 'Inventory Unavailable')
          .map((c) => c.productId),
      ),
      suggestedOwner: 'Seller: catalogue and inventory',
    })
  }

  /* Fulfilment */
  if (ctx.delivery.dispatchSlaBreaches.current > 0) {
    const slow = ctx.delivery.slowestProducts.slice(0, 4)
    add({
      actionId: ACTION_IDS.dispatchDelays,
      title: 'Ask the warehouse team to look into slow dispatch',
      description: `Find out why some orders wait more than ${DISPATCH_SLA_HOURS} hours before dispatch, starting with ${slow.map((p) => p.productName).join(', ')}.`,
      category: 'fulfilment',
      priority: 'high',
      businessImpact: `${ctx.delivery.dispatchSlaBreaches.current} October shipments missed the ${DISPATCH_SLA_HOURS}-hour dispatch window (${ctx.delivery.dispatchSlaBreaches.previous} in September); ${ctx.delivery.late.current} deliveries arrived late.`,
      supportingEvidence: slow.map(
        (p) => `${p.productName}: ${p.slaBreaches} of ${p.shipments} shipments dispatched late, average ${formatDecimal(p.averageProcessingHours)} hours`,
      ),
      findingIds: [],
      affectedProducts: slow.map((p) => p.productId),
      suggestedOwner: 'Seller: warehouse',
    })
  }

  /* Quality and listings */
  const quality = ctx.returns.byProduct.filter((p) => p.qualityComplaints >= 2)
  if (quality.length) {
    add({
      actionId: ACTION_IDS.inspectQuality,
      title: `Inspect returned ${quality.map((q) => q.productName).join(', ')} for defects`,
      description: 'Check returned units and remaining stock for a batch defect before selling more. Share findings with the supplier.',
      category: 'quality',
      priority: 'high',
      businessImpact: `${quality.reduce((s, q) => s + q.qualityComplaints, 0)} quality complaints in October returns.`,
      supportingEvidence: quality.map((q) => `${q.productName}: ${q.returns} returns from ${q.delivered} deliveries, ${q.qualityComplaints} quality complaints`),
      findingIds: [],
      affectedProducts: quality.map((q) => q.productId),
      suggestedOwner: 'Seller: quality control',
    })
  }

  const byReason = (reason: string) =>
    store.returns.filter((r) => r.period === 'current' && r.returnReason === reason)
  const size = byReason('Size Issue')
  if (size.length >= 3) {
    add({
      actionId: ACTION_IDS.sizeGuidance,
      title: 'Fix size guidance on listings with size returns',
      description: 'Update the size chart and add fit notes (for example “runs small, consider one size up”) where customers return for size.',
      category: 'listing',
      priority: 'medium',
      businessImpact: `${size.length} October returns were for size.`,
      supportingEvidence: [`Size Issue returns in October: ${size.length}`],
      findingIds: [],
      affectedProducts: unique(size.map((r) => r.productId)),
      suggestedOwner: 'Seller: catalogue',
    })
  }

  const colour = [...byReason('Colour Mismatch'), ...byReason('Different From Description')]
  if (colour.length >= 2) {
    add({
      actionId: ACTION_IDS.colourAccuracy,
      title: 'Review product photos and colour descriptions',
      description: 'Reshoot or colour-correct photos and describe colours accurately where customers say the item looks different.',
      category: 'listing',
      priority: 'medium',
      businessImpact: `${colour.length} October returns said the item looked different from the listing.`,
      supportingEvidence: [`Colour or description mismatch returns in October: ${colour.length}`],
      findingIds: [],
      affectedProducts: unique(colour.map((r) => r.productId)),
      suggestedOwner: 'Seller: catalogue',
    })
  }

  const damaged = byReason('Damaged During Delivery')
  if (damaged.length >= 2) {
    add({
      actionId: ACTION_IDS.packaging,
      title: 'Strengthen packaging for fragile items',
      description: 'Use protective inner packaging for items damaged in transit, and raise damage claims with the courier where eligible.',
      category: 'fulfilment',
      priority: 'medium',
      businessImpact: `${damaged.length} October returns arrived damaged.`,
      supportingEvidence: [`Damaged During Delivery returns in October: ${damaged.length}`],
      findingIds: [],
      affectedProducts: unique(damaged.map((r) => r.productId)),
      suggestedOwner: 'Seller: warehouse',
    })
  }

  /* Pricing and visibility */
  const expensive = ctx.pricing.expensive
  if (expensive.length) {
    add({
      actionId: ACTION_IDS.reviewPricing,
      title: 'Review prices that sit well above the reference',
      description: `Check whether ${expensive.map((p) => p.productName).join(', ')} are priced too high for their conversion. Reference prices here are synthetic.`,
      category: 'pricing',
      priority: 'medium',
      businessImpact: 'Products priced above the reference convert less in this data.',
      supportingEvidence: expensive.map(
        (p) =>
          `${p.productName}: ${formatCurrency(p.currentSellingPrice)} vs reference ${formatCurrency(p.syntheticMarketReferencePrice!)}, conversion ${formatPercent(p.conversionRate)}`,
      ),
      findingIds: [],
      affectedProducts: expensive.map((p) => p.productId),
      suggestedOwner: 'Seller: pricing',
    })
  }

  const thin = ctx.products.highRevenueLowMargin
  if (thin.length) {
    add({
      actionId: ACTION_IDS.protectMargin,
      title: 'Check margin on heavily discounted products',
      description: 'Confirm that discounts on these products still leave room for fees and shipping before pushing more volume.',
      category: 'pricing',
      priority: 'medium',
      businessImpact: 'High sales on a thin estimated gross margin can mean little or no profit after fees.',
      supportingEvidence: thin.map((p) => `${p.productName}: estimated gross margin ${formatPercent(p.grossMargin)} on ${formatCurrency(p.revenue)} of sales`),
      findingIds: [],
      affectedProducts: thin.map((p) => p.productId),
      suggestedOwner: 'Seller: pricing',
    })
  }

  const hidden = ctx.products.highConversionLowVisibility
  if (hidden.length) {
    add({
      actionId: ACTION_IDS.boostVisibility,
      title: 'Give high-converting products more visibility',
      description: 'Consider sponsored placement, better keywords or bundling for products that sell well when seen but are rarely shown.',
      category: 'visibility',
      priority: 'medium',
      businessImpact: 'More impressions on products that already convert well is the cheapest growth in this data.',
      supportingEvidence: hidden.map(
        (p) => `${p.productName}: ${formatPercent(p.conversionRate)} conversion on only ${p.impressions.toLocaleString('en-IN')} impressions`,
      ),
      findingIds: [],
      affectedProducts: hidden.map((p) => p.productId),
      suggestedOwner: 'Seller: marketing',
    })
  }

  const leaky = ctx.products.highViewsLowConversion
  if (leaky.length) {
    add({
      actionId: ACTION_IDS.improveConversion,
      title: 'Improve listings that get views but few orders',
      description: 'Review price, photos, title and description for products with many visitors and few buyers.',
      category: 'visibility',
      priority: 'medium',
      businessImpact: 'Visitors are already arriving; converting more of them needs no extra traffic.',
      supportingEvidence: leaky.map(
        (p) => `${p.productName}: ${p.productViews.toLocaleString('en-IN')} views, ${formatPercent(p.conversionRate)} conversion`,
      ),
      findingIds: [],
      affectedProducts: leaky.map((p) => p.productId),
      suggestedOwner: 'Seller: catalogue',
    })
  }

  const flagged = ctx.customers.flagged
  if (flagged.length) {
    add({
      actionId: ACTION_IDS.customerReview,
      title: 'Have someone review unusual cancellation and return patterns',
      description: 'An authorised team member can review these anonymised patterns. Do not block customers, refuse refunds or override marketplace policy based on them.',
      category: 'customers',
      priority: 'low',
      businessImpact: `${flagged.length} anonymised customers show repeated cancellations, returns or order changes.`,
      supportingEvidence: flagged.map((c) => `${c.anonymisedCustomerId}: ${c.patternFlag}. ${c.evidenceSummary}`),
      findingIds: [],
      affectedProducts: [],
      suggestedOwner: 'Seller: customer support (human review)',
    })
  }

  cache.set(ctx, actions)
  return actions
}

/** Names of products (from the given IDs) whose October returns include repeated quality complaints. */
export function qualityProblemNames(ctx: Context, productIds: string[]): string[] {
  const ids = new Set(productIds)
  return ctx.returns.byProduct.filter((p) => p.qualityComplaints >= 2 && ids.has(p.productId)).map((p) => p.productName)
}

/** Only IDs of actions that exist for this data, so findings never point at missing actions. */
export function existingActions(ctx: Context, ...ids: string[]): string[] {
  const available = new Set(getRecommendations(ctx).map((a) => a.actionId))
  return ids.filter((id) => available.has(id))
}
