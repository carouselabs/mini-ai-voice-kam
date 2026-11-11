import type { ApiError, ApiResponse } from '@shared/api.ts'

export class ApiRequestError extends Error {
  status: number
  details: string[]

  constructor(status: number, message: string, details: string[] = []) {
    super(message)
    this.status = status
    this.details = details
  }
}

/** The demo data is read-only, so identical requests share one response for the session. */
const cache = new Map<string, Promise<ApiResponse<unknown>>>()

export function fetchApi<T>(path: string, { fresh = false } = {}): Promise<ApiResponse<T>> {
  const cached = cache.get(path)
  if (cached && !fresh) return cached as Promise<ApiResponse<T>>

  const request = fetch(path, { headers: { Accept: 'application/json' } }).then(async (response) => {
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const error = (body as ApiError | null)?.error
      throw new ApiRequestError(response.status, error?.message ?? `Request failed (${response.status})`, error?.details)
    }
    return body as ApiResponse<T>
  })
  cache.set(path, request)
  request.catch(() => cache.delete(path))
  return request
}

/* ---------- The seller's workspace (tracker, decisions, memory) changes, so it is never cached ---------- */

const WORKSPACE_EVENT = 'mini-ai:workspace-changed'

/** Tells every open page (and the assistant's cards) that the tracker, decisions or memory changed. */
export function notifyWorkspaceChanged() {
  window.dispatchEvent(new Event(WORKSPACE_EVENT))
}

export function onWorkspaceChanged(listener: () => void): () => void {
  window.addEventListener(WORKSPACE_EVENT, listener)
  return () => window.removeEventListener(WORKSPACE_EVENT, listener)
}

/** Sends a change to the API. Throws ApiRequestError with the server's message on failure. */
export async function sendApi<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T | null> {
  const response = await fetch(path, {
    method,
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json: unknown = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const error = (json as ApiError | null)?.error
    throw new ApiRequestError(response.status, error?.message ?? `Request failed (${response.status})`, error?.details)
  }
  notifyWorkspaceChanged()
  return json === null ? null : (json as ApiResponse<T>).data
}
