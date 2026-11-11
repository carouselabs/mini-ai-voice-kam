import type { ResponseMeta } from '@shared/api.ts'
import { useCallback, useEffect, useState } from 'react'
import { fetchApi } from '@/lib/api'

export type ApiState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: T; meta: ResponseMeta }

/** Loads a read-only API resource with loading, error and retry states. */
export function useApi<T>(path: string): ApiState<T> & { retry: () => void } {
  const [state, setState] = useState<{ path: string; value: ApiState<T> }>({ path, value: { status: 'loading' } })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    fetchApi<T>(path, { fresh: attempt > 0 })
      .then((response) => {
        if (active) setState({ path, value: { status: 'success', data: response.data, meta: response.meta } })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ path, value: { status: 'error', error: error instanceof Error ? error.message : 'Could not load data' } })
        }
      })
    return () => {
      active = false
    }
  }, [path, attempt])

  const retry = useCallback(() => {
    setState({ path, value: { status: 'loading' } })
    setAttempt((n) => n + 1)
  }, [path])

  // A new path shows loading until its own response arrives.
  const value: ApiState<T> = state.path === path ? state.value : { status: 'loading' }
  return { ...value, retry }
}
