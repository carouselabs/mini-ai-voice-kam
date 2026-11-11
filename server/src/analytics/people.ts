import type { CatalogueHealth, CustomerPatternAnalysis, ReviewAnalysis } from '../../../shared/analytics.ts'
import { ordersIn, type Store } from '../data/store.ts'
import { shares } from './compare.ts'
import { round, sum } from './math.ts'

export const CUSTOMER_GUARDRAIL =
  'A pattern is not proof of misuse. Mini AI never blocks customers, refuses refunds or overrides marketplace policy; flagged patterns are suggestions for authorised human review.'

export function getCustomerPatterns(store: Store): CustomerPatternAnalysis {
  const flagged = store.customers.filter((c) => c.patternFlag !== 'Normal')
  return {
    guardrail: CUSTOMER_GUARDRAIL,
    profilesAnalysed: store.customers.length,
    flagged,
    flagCounts: shares(store.customers, (c) => c.patternFlag),
  }
}

export const REVIEW_NOTE = 'Recent reviews. Review text is synthetic and written for the demo.'

export function getReviewAnalysis(store: Store): ReviewAnalysis {
  const productIds = [...new Set(store.reviews.map((r) => r.productId))]
  return {
    note: REVIEW_NOTE,
    total: store.reviews.length,
    sentiment: shares(store.reviews, (r) => r.sentiment),
    issues: shares(
      store.reviews.filter((r) => r.issueCategory !== 'None'),
      (r) => r.issueCategory,
    ),
    byProduct: productIds
      .map((productId) => {
        const mine = store.reviews.filter((r) => r.productId === productId)
        return {
          productId,
          productName: store.index.product.get(productId)?.productName ?? productId,
          reviews: mine.length,
          averageRating: round(sum(mine, (r) => r.rating) / mine.length, 1),
          negative: mine.filter((r) => r.sentiment === 'Negative').length,
          issues: [...new Set(mine.map((r) => r.issueCategory).filter((i) => i !== 'None'))],
        }
      })
      .sort((a, b) => b.negative - a.negative || a.averageRating - b.averageRating),
  }
}

export function getCatalogueHealth(store: Store): CatalogueHealth {
  const current = ordersIn(store, 'current')
  return {
    products: store.products.length,
    skus: store.inventory.length,
    listingStatus: shares(store.products, (p) => p.listingStatus),
    lowRated: store.products
      .filter((p) => p.rating < 3.6)
      .map((p) => ({ productId: p.productId, productName: p.productName, rating: p.rating })),
    zeroOrderProducts: store.products
      .filter((p) => !current.some((o) => o.productId === p.productId))
      .map((p) => ({
        productId: p.productId,
        productName: p.productName,
        reason: p.listingStatus === 'Out of Stock' ? 'Out of stock all month' : 'No orders this month',
      })),
  }
}
