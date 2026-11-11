import type { LucideIcon } from 'lucide-react'

/* ---------- Navigation ---------- */

export type NavSectionId = 'business' | 'operations' | 'growth' | 'intelligence' | 'account'

export interface NavItem {
  id: string
  label: string
  path: string
  icon: LucideIcon
  section: NavSectionId
  description: string
  /** An example question the Virtual KAM will be able to answer about this area. */
  sampleQuestion?: string
}

export interface NavSection {
  id: NavSectionId
  label: string
  items: readonly NavItem[]
}

/* ---------- Seller data ---------- */

export interface SellerProfile {
  name: string
  initials: string
  accountLabel: string
  isDemo: boolean
}

export interface PeriodValue {
  current: number
  previous: number
}

export interface SellerSnapshot {
  source: { label: string; detail: string }
  periods: { current: string; previous: string }
  sales: PeriodValue | null
  orders: PeriodValue | null
  /** Ratio between 0 and 1. */
  cancellationRate: PeriodValue | null
  /** Ratio between 0 and 1. */
  returnRate: PeriodValue | null
  outOfStockProducts: PeriodValue | null
}

/* ---------- Metrics ---------- */

export type MetricKey =
  | 'sales'
  | 'orders'
  | 'averageOrderValue'
  | 'cancellationRate'
  | 'returnRate'
  | 'outOfStockProducts'

export type MetricFormat = 'currency' | 'count' | 'percent'
/** Relative change for amounts and counts; percentage points for rates. */
export type ChangeKind = 'relative' | 'points'
export type Polarity = 'higher-is-better' | 'lower-is-better'
export type ChangeDirection = 'up' | 'down' | 'flat'
export type ChangeTone = 'positive' | 'negative' | 'neutral'

export interface MetricChange {
  text: string
  direction: ChangeDirection
  tone: ChangeTone
  /** Full sentence for screen readers. */
  description: string
}

export interface MetricModel {
  key: MetricKey
  label: string
  value: string | null
  previousValue: string | null
  change: MetricChange | null
  comparisonLabel: string
  previousLabel: string
  unavailableReason: string
}

/* ---------- Assistant ---------- */

export type AssistantView = 'closed' | 'open' | 'minimised'
export type MessageAuthor = 'seller' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  author: MessageAuthor
  text: string
  createdAt: number
}
