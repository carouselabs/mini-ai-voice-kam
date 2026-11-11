import { getCancellationAnalysis } from '../analytics/cancellations.ts'
import { getDeliveryAnalysis } from '../analytics/delivery.ts'
import { getInventoryAnalysis } from '../analytics/inventory.ts'
import { getCustomerPatterns, getReviewAnalysis } from '../analytics/people.ts'
import { getProductAnalysis } from '../analytics/products.ts'
import { getPricingAnalysis, getProfitabilityAnalysis } from '../analytics/profitability.ts'
import { getReturnAnalysis } from '../analytics/returns.ts'
import { getOrdersAnalysis, getRevenueAnalysis } from '../analytics/revenue.ts'
import type { Store } from '../data/store.ts'

/** Every analysis computed once per dataset. The data is static, so results are cached by store. */
export interface Context {
  store: Store
  revenue: ReturnType<typeof getRevenueAnalysis>
  orders: ReturnType<typeof getOrdersAnalysis>
  cancellations: ReturnType<typeof getCancellationAnalysis>
  returns: ReturnType<typeof getReturnAnalysis>
  inventory: ReturnType<typeof getInventoryAnalysis>
  products: ReturnType<typeof getProductAnalysis>
  delivery: ReturnType<typeof getDeliveryAnalysis>
  profitability: ReturnType<typeof getProfitabilityAnalysis>
  pricing: ReturnType<typeof getPricingAnalysis>
  customers: ReturnType<typeof getCustomerPatterns>
  reviews: ReturnType<typeof getReviewAnalysis>
}

const cache = new WeakMap<Store, Context>()

export function contextFor(store: Store): Context {
  let context = cache.get(store)
  if (!context) {
    context = {
      store,
      revenue: getRevenueAnalysis(store),
      orders: getOrdersAnalysis(store),
      cancellations: getCancellationAnalysis(store),
      returns: getReturnAnalysis(store),
      inventory: getInventoryAnalysis(store),
      products: getProductAnalysis(store),
      delivery: getDeliveryAnalysis(store),
      profitability: getProfitabilityAnalysis(store),
      pricing: getPricingAnalysis(store),
      customers: getCustomerPatterns(store),
      reviews: getReviewAnalysis(store),
    }
    cache.set(store, context)
  }
  return context
}
