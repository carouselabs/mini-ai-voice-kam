import type {
  CheckedArea,
  DataGap,
  Discrepancy,
  Evidence,
  Finding,
  Investigation,
  InvestigationScenario,
  Severity,
} from '../../../shared/insights.ts'
import { formatPercent } from '../../../shared/format.ts'
import type { SourceType } from '../../../shared/records.ts'
import type { Context } from '../insights/context.ts'

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

/** Label used everywhere the 8% → 14% figure appears, so it is never read as a seller-side rate. */
export const OVERALL_CANCELLATION_LABEL = 'Overall cancellation rate (all initiators)'

/** Who started the cancellations: count and share of all orders, per initiator. */
export function initiatorEvidence(ctx: Context): Evidence[] {
  return ctx.cancellations.breakdown.byInitiator.map((i) =>
    evidence(
      i.label.replace(/^./, (c) => c.toUpperCase()),
      `${i.count.previous} → ${i.count.current} orders (${formatPercent(i.shareOfOrders.previous)} → ${formatPercent(i.shareOfOrders.current)} of orders)`,
      'synthetic_demo',
    ),
  )
}
const CONFIDENCE_RANK = { high: 0, medium: 1, low: 2 } as const

export function evidence(
  label: string,
  value: string,
  source: SourceType,
  detail?: string,
  recordIds?: string[],
): Evidence {
  return { label, value, source, ...(detail ? { detail } : {}), ...(recordIds?.length ? { recordIds } : {}) }
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence],
  )
}

export function investigation(
  ctx: Context,
  scenario: InvestigationScenario,
  question: string,
  headline: string,
  findings: Finding[],
  checkedAreas: CheckedArea[],
  dataGaps: DataGap[] = [],
  discrepancies: Discrepancy[] = [],
): Investigation {
  return {
    scenario,
    question,
    headline,
    findings: sortFindings(findings),
    checkedAreas,
    dataGaps,
    discrepancies,
    generatedAt: ctx.store.manifest.lastUpdatedAt,
  }
}

export const area = (name: string, status: CheckedArea['status'], note: string): CheckedArea => ({
  area: name,
  status,
  note,
})

export const product = (ctx: Context, productId: string, reason: string, value?: number) => ({
  productId,
  productName: ctx.store.index.product.get(productId)?.productName ?? productId,
  reason,
  ...(value !== undefined ? { value } : {}),
})
