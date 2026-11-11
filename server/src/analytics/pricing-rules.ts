import type { PricingPosition } from '../../../shared/records.ts'
import { round } from './math.ts'

/** Price ÷ synthetic reference price thresholds. */
export const PRICING_BANDS = {
  below: 0.95,
  competitive: 1.05,
  slightlyExpensive: 1.15,
} as const

/** The lowest margin a suggested price may leave (before fees, shipping, ads and tax). */
export const MIN_SUGGESTED_MARGIN = 0.15

export function pricingPosition(price: number, reference: number | null): PricingPosition {
  if (reference === null || reference <= 0) return 'Insufficient Data'
  const ratio = price / reference
  if (ratio < PRICING_BANDS.below) return 'Below Market Reference'
  if (ratio <= PRICING_BANDS.competitive) return 'Competitive'
  if (ratio <= PRICING_BANDS.slightlyExpensive) return 'Slightly Expensive'
  return 'Significantly Expensive'
}

/** (price − cost) ÷ price. Excludes platform fees, shipping, advertising and tax, which are not in the data. */
export function grossMargin(price: number, cost: number): number {
  if (price <= 0) return 0
  return round((price - cost) / price, 4)
}

export function discountFromMrp(price: number, mrp: number): number {
  if (mrp <= 0) return 0
  return round((mrp - price) / mrp, 4)
}

/** Around the reference price, but never below a 15% gross margin. */
export function suggestedPriceRange(reference: number | null, cost: number): { min: number; max: number } | null {
  if (reference === null) return null
  const floor = Math.ceil(cost / (1 - MIN_SUGGESTED_MARGIN))
  const min = Math.max(Math.round(reference * 0.95), floor)
  const max = Math.max(Math.round(reference * 1.03), min)
  return { min, max }
}
