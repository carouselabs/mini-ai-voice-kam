import type { ActionRecommendation, Investigation, InvestigationScenario } from '../../../shared/insights.ts'
import type { Store } from '../data/store.ts'
import { contextFor, type Context } from '../insights/context.ts'
import { getRecommendations } from '../insights/recommendations.ts'
import { area, investigation, sortFindings } from './build.ts'
import { investigateCancellationSpike, investigateInventoryRisk, investigateReturnSpike } from './operations.ts'
import { investigatePricing, investigateProductVisibility, investigateSalesDecline } from './sales.ts'

export const INVESTIGATIONS: Record<Exclude<InvestigationScenario, 'overview'>, (ctx: Context) => Investigation> = {
  'sales-decline': investigateSalesDecline,
  cancellations: investigateCancellationSpike,
  returns: investigateReturnSpike,
  inventory: investigateInventoryRisk,
  visibility: investigateProductVisibility,
  pricing: investigatePricing,
}

const overviewCache = new WeakMap<Context, Investigation>()

/** Every scenario at once, most severe findings first, with a duplicate-free list. */
export function investigateOverview(ctx: Context): Investigation {
  const cached = overviewCache.get(ctx)
  if (cached) return cached
  const all = Object.values(INVESTIGATIONS).map((run) => run(ctx))
  const seen = new Set<string>()
  const findings = sortFindings(all.flatMap((i) => i.findings)).filter((f) => {
    if (seen.has(f.findingId)) return false
    seen.add(f.findingId)
    return true
  })
  const result = investigation(
    ctx,
    'overview',
    'What should I improve first?',
    all[0].headline,
    findings,
    all.map((i) =>
      area(
        i.question,
        i.findings.some((f) => f.severity === 'critical' || f.severity === 'high') ? 'issue_found' : 'no_issue',
        i.headline,
      ),
    ),
    all.flatMap((i) => i.dataGaps).filter((gap, index, list) => list.findIndex((g) => g.topic === gap.topic) === index),
    all[0].discrepancies,
  )
  overviewCache.set(ctx, result)
  return result
}

export function runInvestigation(store: Store, scenario: InvestigationScenario): Investigation {
  const ctx = contextFor(store)
  return scenario === 'overview' ? investigateOverview(ctx) : INVESTIGATIONS[scenario](ctx)
}

/** Recommendations with the findings that support each one. */
export function recommendationsWithFindings(store: Store): ActionRecommendation[] {
  const ctx = contextFor(store)
  const findings = investigateOverview(ctx).findings
  return getRecommendations(ctx).map((action) => ({
    ...action,
    findingIds: findings.filter((f) => f.recommendedActions.includes(action.actionId)).map((f) => f.findingId),
  }))
}
