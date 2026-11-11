import type { ResponseMeta } from '@shared/api.ts'
import { useCallback, useEffect, useState } from 'react'
import { fetchApi, onWorkspaceChanged } from '@/lib/api'
import type { ApiState } from './useApi'

type Loaded = { data: unknown; meta: ResponseMeta }

/** The last response seen for each path, so a page shows it instantly when opened again while it refreshes. */
const lastSeen = new Map<string, Loaded>()

/** Loads seller-changeable data in the background (after the first screen), so the first visit is instant too. */
export function primeLive(path: string): Promise<void> {
  return fetchApi(path, { fresh: true })
    .then((response) => void lastSeen.set(path, { data: response.data, meta: response.meta as ResponseMeta }))
    .catch(() => {})
}

/**
 * Like useApi, for data the seller can change (tracker, recommendations, memory, review).
 * Always fetched fresh, and reloaded whenever the workspace changes anywhere in the app. While it loads, the last
 * data seen for this path stays on screen instead of a loading state.
 */
export function useLiveApi<T>(path: string): ApiState<T> & { retry: () => void } {
  const seen = (p: string): ApiState<T> => {
    const hit = lastSeen.get(p)
    return hit ? { status: 'success', data: hit.data as T, meta: hit.meta } : { status: 'loading' }
  }
  const [value, setValue] = useState<{ path: string; state: ApiState<T> }>(() => ({ path, state: seen(path) }))
  const [version, setVersion] = useState(0)

  useEffect(() => onWorkspaceChanged(() => setVersion((v) => v + 1)), [])

  useEffect(() => {
    let active = true
    fetchApi<T>(path, { fresh: true })
      .then((response) => {
        lastSeen.set(path, { data: response.data, meta: response.meta as ResponseMeta })
        if (active) setValue({ path, state: { status: 'success', data: response.data, meta: response.meta as ResponseMeta } })
      })
      .catch((error: unknown) => {
        if (active) setValue({ path, state: { status: 'error', error: error instanceof Error ? error.message : 'Could not load data' } })
      })
    return () => {
      active = false
    }
  }, [path, version])

  const retry = useCallback(() => setVersion((v) => v + 1), [])
  const state: ApiState<T> = value.path === path ? value.state : seen(path)
  return { ...state, retry }
}
