import type { PricingAnalysis, PricingRow, ProfitabilityAnalysis, ProfitabilityRow } from '../../../shared/analytics.ts'
import type { Order, PeriodKey } from '../../../shared/records.ts'
import { ordersIn, type Store } from '../data/store.ts'
import { compare, compareRates, shares } from './compare.ts'
import { PRICING_BANDS } from './pricing-rules.ts'
import { ratioOrZero, round, safeDivide, sum } from './math.ts'

export const PROFIT_NOTE =
  'Estimated gross profit = selling price − cost price on orders that were kept (not cancelled or returned). It is not net profit: platform fees, shipping, advertising, payment charges and tax are not in the data and are not estimated.'

const kept = (orders: Order[]) =>
  orders.filter((o) => !['Cancelled', 'Returned', 'Return Requested'].includes(o.orderStatus))

export function getProfitabilityAnalysis(store: Store): ProfitabilityAnalysis {
  const cost = (o: Order) => (store.index.product.get(o.productId)?.costPrice ?? 0) * o.quantity
  const totals = (period: PeriodKey) => {
    const list = kept(ordersIn(store, period))
    const revenue = sum(list, (o) => o.totalAmount)
    const costs = sum(list, cost)
    return { revenue, costs, profit: revenue - costs, margin: round(ratioOrZero(revenue - costs, revenue), 4) }
  }
  const prev = totals('previous')
  const cur = totals('current')

  const curKept = kept(ordersIn(store, 'current'))
  const rows: ProfitabilityRow[] = store.products
    .map((p) => {
      const mine = curKept.filter((o) => o.productId === p.productId)
      const netRevenue = sum(mine, (o) => o.totalAmount)
      const estimatedCost = sum(mine, cost)
      return {
        productId: p.productId,
        productName: p.productName,
        keptOrders: mine.length,
        netRevenue,
        estimatedCost,
        estimatedGrossProfit: netRevenue - estimatedCost,
        grossMargin: round(ratioOrZero(netRevenue - estimatedCost, netRevenue), 4),
      }
    })
    .sort((a, b) => b.estimatedGrossProfit - a.estimatedGrossProfit)

  return {
    note: PROFIT_NOTE,
    netRevenue: compare(prev.revenue, cur.revenue),
    estimatedCost: compare(prev.costs, cur.costs),
    estimatedGrossProfit: compare(prev.profit, cur.profit),
    grossMargin: compareRates(prev.margin, cur.margin),
    rows,
  }
}

export const PRICING_NOTE =
  'Market reference prices are synthetic demo values, not real competitor or marketplace prices. Treat pricing positions as prompts for review.'

export function getPricingAnalysis(store: Store): PricingAnalysis {
  const rows: PricingRow[] = store.pricing.map((p) => {
    const product = store.index.product.get(p.productId)!
    const prevOrders = ordersIn(store, 'previous').filter((o) => o.productId === p.productId).length
    const curOrders = ordersIn(store, 'current').filter((o) => o.productId === p.productId).length
    const ratio = p.syntheticMarketReferencePrice ? safeDivide(p.currentSellingPrice, p.syntheticMarketReferencePrice) : null
    return {
      productId: p.productId,
      productName: product.productName,
      currentSellingPrice: p.currentSellingPrice,
      previousSellingPrice: p.previousSellingPrice,
      costPrice: p.costPrice,
      syntheticMarketReferencePrice: p.syntheticMarketReferencePrice,
      priceToReference: ratio === null ? null : round(ratio, 3),
      pricingPosition: p.pricingPosition,
      suggestedPriceRange: p.suggestedPriceRange,
      discountPercentage: p.discountPercentage,
      estimatedGrossMargin: p.estimatedGrossMargin,
      conversionRate: round(ratioOrZero(curOrders, product.productViews), 4),
      previousConversionRate: round(ratioOrZero(prevOrders, product.previousPeriodProductViews), 4),
      priceChanged: p.currentSellingPrice !== p.previousSellingPrice,
    }
  })
  return {
    note: PRICING_NOTE,
    rows,
    positions: shares(rows, (r) => r.pricingPosition),
    expensive: rows
      .filter((r) => r.priceToReference !== null && r.priceToReference > PRICING_BANDS.competitive)
      .sort((a, b) => (b.priceToReference ?? 0) - (a.priceToReference ?? 0)),
    thinMargin: rows.filter((r) => r.estimatedGrossMargin < 0.2).sort((a, b) => a.estimatedGrossMargin - b.estimatedGrossMargin),
    belowReference: rows.filter((r) => r.pricingPosition === 'Below Market Reference'),
  }
}
