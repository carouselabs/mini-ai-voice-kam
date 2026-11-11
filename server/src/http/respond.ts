import type { ErrorRequestHandler, Response } from 'express'
import type { ApiError, ApiResponse, ResponseMeta } from '../../../shared/api.ts'
import type { SourceType } from '../../../shared/records.ts'
import { freshness } from '../analytics/overview.ts'
import type { Store } from '../data/store.ts'

export class HttpError extends Error {
  status: number
  code: ApiError['error']['code']
  details?: string[]

  constructor(status: number, code: ApiError['error']['code'], message: string, details?: string[]) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`)

export function send<T>(
  res: Response,
  store: Store,
  data: T,
  sourceTypes: SourceType[],
  extra: Pick<ResponseMeta, 'total' | 'filters' | 'notes'> = {},
) {
  const body: ApiResponse<T> = {
    data,
    meta: {
      dataMode: 'DEMO',
      sourceTypes,
      lastUpdatedAt: store.manifest.lastUpdatedAt,
      freshness: freshness(store),
      periods: store.manifest.periods,
      ...extra,
    },
  }
  res.json(body)
}

/** One error shape for every failure. Internal details are logged, never returned. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    const body: ApiError = { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } }
    res.status(error.status).json(body)
    return
  }
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'bad_request', message: 'Request body is not valid JSON' } } satisfies ApiError)
    return
  }
  console.error(error)
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } } satisfies ApiError)
}
