import type { SellerProfile } from '@shared/records.ts'
import { initialsOf } from '@/lib/format'
import { useApi } from './useApi'

export type SellerProfileResponse = SellerProfile & { assumptions: string[] }

/** The demo seller and the reporting periods, from the API. */
export function useSeller() {
  const result = useApi<SellerProfileResponse>('/api/seller/profile')
  const seller = result.status === 'success' ? result.data : null
  return {
    seller,
    name: seller?.sellerName ?? 'Loading seller…',
    initials: seller ? initialsOf(seller.sellerName) : '',
    accountLabel: 'Demo seller account',
    periods: result.status === 'success' ? result.meta.periods : null,
    lastUpdatedAt: result.status === 'success' ? result.meta.lastUpdatedAt : null,
  }
}
