import { primeLive } from '@/hooks/useLiveApi'
import { fetchApi } from './api'

/** Read-only data behind each page, exactly as the pages request it (the cache key is the path). */
const READ_ONLY = [
  '/api/seller/overview',
  '/api/seller/profile',
  '/api/products?limit=1000',
  '/api/orders?period=current',
  '/api/inventory?limit=1000',
  '/api/cancellations?period=current',
  '/api/analytics/cancellations',
  '/api/returns?period=current',
  '/api/analytics/returns',
  '/api/analytics/delivery',
  '/api/analytics/products',
  '/api/analytics/reviews',
  '/api/analytics/catalogue',
  '/api/reviews?limit=200',
  '/api/analytics/revenue',
  '/api/analytics/profitability',
  '/api/analytics/pricing',
  '/api/shipments?period=current',
]

/** Data the seller can change; shown instantly on a page's first visit, then refreshed there. */
const LIVE = ['/api/review', '/api/actions/recommendations', '/api/tracker', '/api/memory']

let started = false

/**
 * Once the first screen is up and the browser is idle, quietly loads every page's data, one request at a time so it
 * never competes with what the seller is doing. Moving between pages is then instant.
 */
export function prefetchPages() {
  if (started) return
  started = true
  const run = async () => {
    for (const path of LIVE) await primeLive(path)
    for (const path of READ_ONLY) await fetchApi(path).catch(() => {})
  }
  const idle = (window as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(() => void run(), { timeout: 4000 })
  else setTimeout(() => void run(), 2000)
}
