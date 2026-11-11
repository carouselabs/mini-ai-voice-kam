/** Action tracker, recommendation decisions, seller memory and the business review. */
import type { KpiMetric } from './analytics.ts'
import type { ActionRecommendation, Confidence, Finding, Severity } from './insights.ts'
import type { Period } from './records.ts'

export type TrackerStatus = 'Awaiting Approval' | 'Approved' | 'In Progress' | 'Blocked' | 'Completed' | 'Rejected'
export type TrackerPriority = 'Critical' | 'High' | 'Medium' | 'Low'

/** An internal demo task. Mini AI never contacts anyone; these are the seller's own to-dos. */
export interface TrackerAction {
  id: string
  recommendationId: string | null
  title: string
  description: string
  priority: TrackerPriority
  owner: string
  /** YYYY-MM-DD */
  dueDate: string
  status: TrackerStatus
  metricToMonitor: string
  verification: string
  evidence: string[]
  affectedProducts: string[]
  createdAt: string
  /** Who created the entry. Only the seller can approve it. */
  createdBy: 'seller' | 'mini-ai'
  approvedAt: string | null
  completedAt: string | null
  notes: Array<{ at: string; author: 'seller' | 'mini-ai'; text: string }>
  history: Array<{ at: string; from: TrackerStatus | null; to: TrackerStatus }>
}

export interface TrackerSummary {
  total: number
  byStatus: Record<TrackerStatus, number>
  active: number
  overdue: number
  completed: number
  /** Completed ÷ (approved + in progress + blocked + completed); null with no approved actions. */
  completionRate: number | null
}

export interface TrackerList {
  actions: Array<TrackerAction & { overdue: boolean }>
  summary: TrackerSummary
  /** The date overdue is measured against (YYYY-MM-DD, UTC). */
  today: string
}

/** Where a recommendation stands, derived from the tracker and the seller's decisions. */
export type RecommendationState = 'proposed' | 'awaiting_approval' | 'in_tracker' | 'completed' | 'rejected'

export interface RecommendationView extends ActionRecommendation {
  state: RecommendationState
  trackerActionId: string | null
  rejectionReason: string | null
}

/** Something the seller told Mini AI. Never treated as a verified fact. */
export interface SellerMemoryItem {
  id: string
  kind: 'seller_statement' | 'preference' | 'decision' | 'open_question'
  topic: string
  text: string
  productIds: string[]
  source: 'seller'
  verifiedBySystem: false
  createdAt: string
}

export interface StructuredFinding {
  findingId: string
  problem: string
  businessImpact: string
  evidence: Array<{ label: string; value: string; source: string }>
  affected: string[]
  verifiedFacts: string[]
  supportedExplanations: string[]
  hypotheses: string[]
  confidence: Confidence
  severity: Severity
  nextInvestigation: string
  correctiveActions: Array<{ actionId: string; title: string }>
  link: string | null
}

export interface BusinessReview {
  dataAsOf: string
  periods: { previous: Period; current: Period }
  health: {
    kpis: KpiMetric[]
    onTimeDelivery: { previous: number; current: number }
    averageDispatchHours: { previous: number; current: number }
    estimatedGrossProfit: { previous: number; current: number }
    grossMargin: { previous: number; current: number }
  }
  risks: Array<{ title: string; detail: string; severity: Severity; confidence: Confidence; link: string | null }>
  opportunities: Array<{ title: string; detail: string; basis: 'supported' | 'hypothesis'; productIds: string[]; link: string | null }>
  actionPlan: Array<{ actionId: string; title: string; description: string; caution: string | null; priority: TrackerPriority; evidence: string[]; owner: string; suggestedBy: string; metricToMonitor: string; state: RecommendationState }>
  investigations: Array<{ scenario: string; question: string; headline: string; findings: StructuredFinding[] }>
  sellerContext: SellerMemoryItem[]
}

export const TRACKER_STATUSES: TrackerStatus[] = ['Awaiting Approval', 'Approved', 'In Progress', 'Blocked', 'Completed', 'Rejected']

/** Allowed status changes. Completed and Rejected can be reopened. */
export const STATUS_TRANSITIONS: Record<TrackerStatus, TrackerStatus[]> = {
  'Awaiting Approval': ['Approved', 'Rejected'],
  Approved: ['In Progress', 'Blocked', 'Completed', 'Rejected'],
  'In Progress': ['Blocked', 'Completed', 'Approved'],
  Blocked: ['In Progress', 'Completed', 'Approved'],
  Completed: ['In Progress'],
  Rejected: ['Awaiting Approval'],
}

export type { Finding }
