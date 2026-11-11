import type { Request } from 'express'
import type { PeriodKey, ProductCategory } from '../../../shared/records.ts'
import type { Store } from '../data/store.ts'
import { HttpError } from './respond.ts'

export interface ParsedQuery {
  startDate?: string
  endDate?: string
  productId?: string
  category?: ProductCategory
  status?: string
  period?: PeriodKey | 'all'
  q?: string
  limit: number
  offset: number
}

type Param = Exclude<keyof ParsedQuery, 'limit' | 'offset'> | 'limit' | 'offset'

const CATEGORIES: ProductCategory[] = ['Fashion', 'Lifestyle', 'Electronics']
const PERIODS = ['previous', 'current', 'all'] as const
const DATE = /^\d{4}-\d{2}-\d{2}$/

function isRealDate(value: string): boolean {
  if (!DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * Validates query parameters against what an endpoint accepts.
 * Unknown parameters, bad dates, unknown products and out-of-range numbers are rejected with 400.
 */
export function parseQuery(
  req: Request,
  store: Store,
  allowed: Param[],
  options: { statuses?: readonly string[]; defaultLimit?: number; maxLimit?: number } = {},
): ParsedQuery {
  const raw = req.query as Record<string, unknown>
  const problems: string[] = []
  const out: ParsedQuery = { limit: options.defaultLimit ?? 100, offset: 0 }
  const value = (key: string): string | undefined => {
    const v = raw[key]
    if (v === undefined) return undefined
    if (typeof v !== 'string') {
      problems.push(`${key} must be given once`)
      return undefined
    }
    return v.trim()
  }

  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key as Param)) problems.push(`Unknown parameter: ${key}`)
  }

  for (const key of ['startDate', 'endDate'] as const) {
    const v = allowed.includes(key) ? value(key) : undefined
    if (v === undefined) continue
    if (!isRealDate(v)) problems.push(`${key} must be a date in YYYY-MM-DD format`)
    else out[key] = v
  }
  if (out.startDate && out.endDate && out.startDate > out.endDate) problems.push('startDate must be on or before endDate')

  const productId = allowed.includes('productId') ? value('productId') : undefined
  if (productId !== undefined) {
    if (!store.index.product.has(productId)) problems.push(`Unknown productId: ${productId}`)
    else out.productId = productId
  }

  const category = allowed.includes('category') ? value('category') : undefined
  if (category !== undefined) {
    if (!CATEGORIES.includes(category as ProductCategory)) problems.push(`category must be one of ${CATEGORIES.join(', ')}`)
    else out.category = category as ProductCategory
  }

  const period = allowed.includes('period') ? value('period') : undefined
  if (period !== undefined) {
    if (!PERIODS.includes(period as (typeof PERIODS)[number])) problems.push(`period must be one of ${PERIODS.join(', ')}`)
    else out.period = period as ParsedQuery['period']
  }

  const status = allowed.includes('status') ? value('status') : undefined
  if (status !== undefined) {
    if (options.statuses && !options.statuses.includes(status)) problems.push(`status must be one of ${options.statuses.join(', ')}`)
    else out.status = status
  }

  const q = allowed.includes('q') ? value('q') : undefined
  if (q !== undefined) {
    if (q.length > 100) problems.push('q must be 100 characters or fewer')
    else if (q) out.q = q.toLowerCase()
  }

  const max = options.maxLimit ?? 1000
  for (const key of ['limit', 'offset'] as const) {
    const v = allowed.includes(key) ? value(key) : undefined
    if (v === undefined) continue
    const n = Number(v)
    const min = key === 'limit' ? 1 : 0
    if (!Number.isInteger(n) || n < min || (key === 'limit' && n > max)) {
      problems.push(key === 'limit' ? `limit must be a whole number from 1 to ${max}` : 'offset must be a whole number of 0 or more')
    } else out[key] = n
  }

  if (problems.length) throw new HttpError(400, 'bad_request', 'Invalid query parameters', problems)
  return out
}

/** True when an ISO timestamp falls inside the optional IST date range. */
export function inDateRange(iso: string, query: ParsedQuery): boolean {
  const day = new Date(Date.parse(iso) + 5.5 * 3_600_000).toISOString().slice(0, 10)
  return (!query.startDate || day >= query.startDate) && (!query.endDate || day <= query.endDate)
}

export function paginate<T>(rows: T[], query: ParsedQuery): T[] {
  return rows.slice(query.offset, query.offset + query.limit)
}

export function filtersOf(query: ParsedQuery): Record<string, string> {
  const { limit, offset, ...rest } = query
  return Object.fromEntries(
    Object.entries({ ...rest, limit: String(limit), offset: String(offset) }).filter(([, v]) => v !== undefined),
  ) as Record<string, string>
}
