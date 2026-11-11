import type { Period, SourceType } from './records.ts'

export interface ResponseMeta {
  dataMode: 'DEMO'
  sourceTypes: SourceType[]
  /** When the underlying data was last refreshed. */
  lastUpdatedAt: string
  /** current: inside the monthly refresh window; stale: older. */
  freshness: 'current' | 'stale'
  periods: { previous: Period; current: Period }
  /** Present on list endpoints. */
  total?: number
  filters?: Record<string, string>
  notes?: string[]
}

export interface ApiResponse<T> {
  data: T
  meta: ResponseMeta
}

export interface ApiError {
  error: {
    code: 'bad_request' | 'not_found' | 'conflict' | 'internal_error'
    message: string
    details?: string[]
  }
}
