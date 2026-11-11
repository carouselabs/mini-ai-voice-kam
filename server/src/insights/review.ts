import type { Finding, FindingCategory, InvestigationScenario } from '../../../shared/insights.ts'
import { formatCount, formatCurrency, formatPercent } from '../../../shared/format.ts'
import type { BusinessReview, RecommendationView, SellerMemoryItem, StructuredFinding, TrackerPriority } from '../../../shared/tracker.ts'
import { getKpis } from '../analytics/overview.ts'
import type { Store } from '../data/store.ts'
import { INVESTIGATIONS, investigateOverview } from '../investigations/index.ts'
import { contextFor, type Context } from './context.ts'

/** Dashboard page that shows the records behind each kind of finding. */
export const CATEGORY_LINK: Record<FindingCategory, string> = {
  revenue: '/',
  orders: '/orders',
  cancellations: '/cancellations',
  returns: '/returns',
  inventory: '/inventory',
  visibility: '/products',
  pricing: '/analytics',
  delivery: '/delivery',
  customers: '/cancellations',
  profitability: '/analytics',
}

/** What to look at next when a finding is not fully explained. */
const NEXT_STEP: Record<FindingCategory, string> = {
  revenue: 'Split the lost sales by product and week, then check which products recover once restocked.',
  orders: 'Compare daily orders with the stockout dates of the top five products.',
  cancellations: 'Go through the cancelled orders by reason and by hours waited, product by product.',
  returns: 'Inspect the returned units and read the return comments for the products listed.',
  inventory: 'Confirm restock dates with the suppliers and recheck days of cover after the next delivery.',
  visibility: 'Compare impressions before and after each stockout, and again after restocking.',
  pricing: 'Watch conversion for two weeks after any price change and compare with the synthetic reference.',
  delivery: 'Break dispatch time down by product and weekday to find where orders wait.',
  customers: 'An authorised person reviews the underlying orders before any decision is made about a customer.',
  profitability: 'Add marketplace fees and shipping costs to see the margin after all deductions.',
}

const PRIORITY: Record<RecommendationView['priority'], TrackerPriority> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
const RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const

/**
 * A finding laid out as an investigation: what is verified by the records, which explanations the
 * records support (shown alongside the problem, not proven to cause it), and what is only a hypothesis.
 */
export function structureFinding(finding: Finding, titles: Map<string, string>): StructuredFinding {
  const supported = finding.possibleCauses.filter((c) => c.status === 'supported')
  const hypotheses = finding.possibleCauses.filter((c) => c.status === 'hypothesis')
  return {
    findingId: finding.findingId,
    problem: finding.title,
    businessImpact: finding.impact,
    evidence: finding.evidence.map((e) => ({ label: e.label, value: e.value, source: e.source })),
    affected: finding.affectedProducts.map((p) => p.productName),
    verifiedFacts: [finding.observation, ...finding.evidence.filter((e) => e.source !== 'synthetic_demo' || e.recordIds).map((e) => `${e.label}: ${e.value}`)].slice(0, 4),
    supportedExplanations: supported.map((c) => `${c.cause} (${c.confidence} confidence)`),
    hypotheses: hypotheses.map((c) => c.cause),
    confidence: finding.confidence,
    severity: finding.severity,
    nextInvestigation: finding.sellerQuestion ? `Needs your input: ${finding.sellerQuestion}` : NEXT_STEP[finding.category],
    correctiveActions: finding.recommendedActions.map((id) => ({ actionId: id, title: titles.get(id) ?? id })),
    link: CATEGORY_LINK[finding.category],
  }
}

function opportunities(ctx: Context): BusinessReview['opportunities'] {
  const out: BusinessReview['opportunities'] = []
  const { products, inventory, pricing } = ctx

  const noOrder = inventory.outOfStock.filter((i) => i.inTransitStock === 0 && i.estimatedLostSales > 0)
  if (noOrder.length) {
    const lost = noOrder.reduce((s, i) => s + i.estimatedLostSales, 0)
    out.push({
      title: 'Win back sales on best-sellers that are out of stock',
      detail: `${noOrder.length} out-of-stock SKUs with nothing on order sold steadily before running out. Estimated sales missed while out of stock: ${formatCurrency(lost)} (an estimate: average daily sales × days out of stock).`,
      basis: 'supported',
      productIds: [...new Set(noOrder.map((i) => i.productId))],
      link: '/inventory',
    })
  }

  const growing = products.rows.filter((r) => r.revenueChange > 0 && r.availableStock > 0)
  for (const row of growing.slice(0, 2)) {
    const margin = row.grossMargin < 0.2 ? ` Its estimated margin is only ${formatPercent(row.grossMargin)}, so check fees before pushing volume.` : ''
    // The same warnings the Promotions page uses: more volume would hit these problems too.
    const warnings = row.flags.filter((f) => ['High cancellations', 'High returns', 'Low rating'].includes(f))
    const caveat = warnings.length ? ` Fix first: ${warnings.join(', ').toLowerCase()}.` : ''
    out.push({
      title: `${row.productName} is growing`,
      detail: `Sales rose from ${formatCurrency(row.previousRevenue)} to ${formatCurrency(row.revenue)} while most of the catalogue fell.${margin}${caveat}`,
      basis: 'supported',
      productIds: [row.productId],
      link: '/products',
    })
  }

  if (products.highConversionLowVisibility.length) {
    const rows = products.highConversionLowVisibility
    out.push({
      title: 'Products that convert well but are rarely shown',
      detail: `${rows.map((r) => `${r.productName} (${formatPercent(r.conversionRate)} conversion, ${formatCount(r.impressions)} impressions)`).join('; ')}. More visibility might bring more orders; the data has not shown that yet.`,
      basis: 'hypothesis',
      productIds: rows.map((r) => r.productId),
      link: '/promotions',
    })
  }

  const roomToPrice = pricing.belowReference.filter((r) => r.estimatedGrossMargin >= 0.3)
  if (roomToPrice.length) {
    out.push({
      title: 'Some prices sit below the synthetic market reference',
      detail: `${roomToPrice.length} products are priced under the synthetic reference with healthy margins. A small rise might add margin, but it could also lower conversion. Test one product at a time.`,
      basis: 'hypothesis',
      productIds: roomToPrice.map((r) => r.productId),
      link: '/analytics',
    })
  }
  return out
}

/** The business review: health, key risks, growth opportunities and the top three actions. */
export function buildBusinessReview(store: Store, views: RecommendationView[], sellerContext: SellerMemoryItem[]): BusinessReview {
  const ctx = contextFor(store)
  const titles = new Map(views.map((v) => [v.actionId, v.title]))
  const overview = investigateOverview(ctx)

  const risks: BusinessReview['risks'] = []
  const seen = new Set<string>()
  for (const f of overview.findings) {
    if (f.severity !== 'critical' && f.severity !== 'high') continue
    if (seen.has(f.category)) continue
    seen.add(f.category)
    risks.push({ title: f.title, detail: `${f.observation} ${f.impact}`.trim(), severity: f.severity, confidence: f.confidence, link: CATEGORY_LINK[f.category] })
    if (risks.length === 5) break
  }

  const open = views
    .filter((v) => v.state !== 'rejected' && v.state !== 'completed')
    .map((v, i) => ({ v, i }))
    .sort((a, b) => RANK[a.v.priority] - RANK[b.v.priority] || a.i - b.i)
    .slice(0, 3)
    .map(({ v }) => ({
      actionId: v.actionId,
      title: v.title,
      priority: PRIORITY[v.priority],
      description: v.description,
      caution: v.caution,
      evidence: v.supportingEvidence.slice(0, 3),
      owner: v.suggestedOwner,
      suggestedBy: 'Mini AI (needs your approval)',
      metricToMonitor: v.metricToMonitor,
      state: v.state,
    }))

  const investigations = (Object.keys(INVESTIGATIONS) as Array<Exclude<InvestigationScenario, 'overview'>>).map((scenario) => {
    const result = INVESTIGATIONS[scenario](ctx)
    return {
      scenario,
      question: result.question,
      headline: result.headline,
      findings: result.findings.map((f) => structureFinding(f, titles)),
    }
  })

  return {
    dataAsOf: store.manifest.lastUpdatedAt,
    periods: store.manifest.periods,
    health: {
      kpis: getKpis(ctx),
      onTimeDelivery: { previous: ctx.delivery.onTimeRate.previous, current: ctx.delivery.onTimeRate.current },
      averageDispatchHours: { previous: ctx.delivery.averageProcessingHours.previous, current: ctx.delivery.averageProcessingHours.current },
      estimatedGrossProfit: { previous: ctx.profitability.estimatedGrossProfit.previous, current: ctx.profitability.estimatedGrossProfit.current },
      grossMargin: { previous: ctx.profitability.grossMargin.previous, current: ctx.profitability.grossMargin.current },
    },
    risks,
    opportunities: opportunities(ctx),
    actionPlan: open,
    investigations,
    sellerContext,
  }
}
