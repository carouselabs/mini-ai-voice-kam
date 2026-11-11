import type { CustomerPatternFlag } from '../../../shared/records.ts'

/**
 * Pattern flags for anonymised customers. A flag only describes what the records show.
 * Repeated cancellations or returns are not proof of misuse: flagged customers are
 * suggested for authorised human review, never blocked, refused refunds or blacklisted.
 */
export interface CustomerCounts {
  totalOrders: number
  cancelledOrders: number
  returnedOrders: number
  duplicateOrderCancellations: number
}

export const PATTERN_THRESHOLDS = {
  repeatedCancellations: 3,
  repeatedReturns: 3,
  humanReviewCancellations: 2,
  humanReviewReturns: 2,
  frequentOrderChanges: 2,
} as const

export function customerPatternFlag(counts: CustomerCounts): CustomerPatternFlag {
  const t = PATTERN_THRESHOLDS
  if (counts.cancelledOrders >= t.humanReviewCancellations && counts.returnedOrders >= t.humanReviewReturns) {
    return 'Requires Human Review'
  }
  if (counts.cancelledOrders >= t.repeatedCancellations) return 'Repeated Cancellations'
  if (counts.returnedOrders >= t.repeatedReturns) return 'Repeated Returns'
  if (counts.duplicateOrderCancellations >= t.frequentOrderChanges) return 'Frequent Order Changes'
  return 'Normal'
}

/** Counts only when something happened more than once. */
export function repeatedCount(count: number): number {
  return count >= 2 ? count : 0
}
