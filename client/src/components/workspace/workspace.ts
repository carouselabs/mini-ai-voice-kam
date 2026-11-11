import type { ActionPriority } from '@shared/insights.ts'
import type { RecommendationState, TrackerPriority } from '@shared/tracker.ts'
import { useCallback, useState } from 'react'

export const TRACKER_PRIORITY: Record<ActionPriority, TrackerPriority> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
export const DUE_DAYS: Record<TrackerPriority, number> = { Critical: 2, High: 5, Medium: 10, Low: 14 }
export const PRIORITIES: TrackerPriority[] = ['Critical', 'High', 'Medium', 'Low']

export const STATE_LABEL: Record<RecommendationState, string> = {
  proposed: 'Proposed',
  awaiting_approval: 'Awaiting Approval',
  in_tracker: 'In tracker',
  completed: 'Completed',
  rejected: 'Rejected',
}

/** YYYY-MM-DD, today plus some days (local calendar). */
export function inDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Runs one change against the API with busy and error state. */
export function useMutation() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true)
    setError(null)
    try {
      return await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])
  return { run, busy, error, clearError: () => setError(null) }
}
