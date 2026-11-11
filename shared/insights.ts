import type { SourceType } from './records.ts'

export type Severity = 'critical' | 'high' | 'medium' | 'low'
/**
 * high: directly supported by reliable records.
 * medium: several supporting indicators, cause not confirmed.
 * low: early hypothesis or incomplete evidence.
 */
export type Confidence = 'high' | 'medium' | 'low'

export type FindingCategory =
  | 'revenue'
  | 'orders'
  | 'cancellations'
  | 'returns'
  | 'inventory'
  | 'visibility'
  | 'pricing'
  | 'delivery'
  | 'customers'
  | 'profitability'

export interface Evidence {
  label: string
  /** Display-ready value, e.g. "14%" or "₹65,000". */
  value: string
  detail?: string
  source: SourceType
  /** IDs of the records behind this evidence (orders, SKUs, cancellations...). */
  recordIds?: string[]
}

export interface AffectedProduct {
  productId: string
  productName: string
  /** Why this product is listed. */
  reason: string
  /** Optional figure such as a revenue change in ₹. */
  value?: number
}

export interface PossibleCause {
  cause: string
  /** supported: records show it. hypothesis: plausible, not confirmed by data. */
  status: 'supported' | 'hypothesis'
  confidence: Confidence
}

export interface Finding {
  findingId: string
  title: string
  /** For findings whose cause is not proven: the strongest claim the evidence supports, in words. */
  howToState?: string
  severity: Severity
  category: FindingCategory
  observation: string
  impact: string
  evidence: Evidence[]
  affectedProducts: AffectedProduct[]
  possibleCauses: PossibleCause[]
  confidence: Confidence
  dataSource: SourceType | 'mixed'
  /** actionIds from the recommendations list. */
  recommendedActions: string[]
  requiresSellerInput: boolean
  /** Only when the data cannot answer it. */
  sellerQuestion?: string
}

export type InvestigationScenario =
  | 'sales-decline'
  | 'cancellations'
  | 'returns'
  | 'inventory'
  | 'visibility'
  | 'pricing'
  | 'overview'

export interface CheckedArea {
  area: string
  status: 'issue_found' | 'no_issue' | 'insufficient_data'
  note: string
}

export interface DataGap {
  topic: string
  /** What is missing and why it matters. */
  detail: string
}

export interface Discrepancy {
  topic: string
  assignmentValue: string
  recordsValue: string
  /** Whether the difference is only rounding. */
  withinRounding: boolean
  note: string
}

export interface Investigation {
  scenario: InvestigationScenario
  question: string
  headline: string
  findings: Finding[]
  checkedAreas: CheckedArea[]
  dataGaps: DataGap[]
  discrepancies: Discrepancy[]
  generatedAt: string
}

/* ---------- Recommendations ---------- */

export type ActionCategory =
  | 'inventory'
  | 'supplier'
  | 'fulfilment'
  | 'quality'
  | 'listing'
  | 'pricing'
  | 'visibility'
  | 'customers'

export type ActionPriority = 'critical' | 'high' | 'medium' | 'low'
export type ActionStatus = 'proposed' | 'accepted' | 'in_progress' | 'done' | 'dismissed'

export interface ActionRecommendation {
  actionId: string
  title: string
  description: string
  category: ActionCategory
  priority: ActionPriority
  /** The business problem this addresses. */
  problem: string
  /** Why it matters. */
  businessImpact: string
  supportingEvidence: string[]
  /** What to watch once the action is done. */
  metricToMonitor: string
  /** How to tell whether it worked. */
  verification: string
  /** A risk to check before acting (e.g. defects before reordering). Say it whenever the action is mentioned. */
  caution: string | null
  findingIds: string[]
  affectedProducts: string[]
  suggestedOwner: string
  suggestedDeadline: string
  /** Always "proposed" here: Mini AI recommends, it never acts on its own. */
  status: ActionStatus
  requiresSellerApproval: boolean
  createdAt: string
}
