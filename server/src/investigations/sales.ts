import type { Finding, Investigation } from '../../../shared/insights.ts'
import {
  formatCount,
  formatCurrency,
  formatCurrencyChange,
  formatDecimal,
  formatPercent,
  formatPercentChange,
  formatPointChange,
} from '../../../shared/format.ts'
import { ratioOrZero, round } from '../analytics/math.ts'
import type { Context } from '../insights/context.ts'
import { ACTION_IDS, existingActions } from '../insights/recommendations.ts'
import { area, evidence, initiatorEvidence, investigation, OVERALL_CANCELLATION_LABEL, product } from './build.ts'

const pct = (ratio: number | null) => (ratio === null ? 'n/a' : formatPercentChange(ratio))

/** Products with at least one SKU out of stock now. */
function outOfStockProducts(ctx: Context): Set<string> {
  return new Set(ctx.store.inventory.filter((i) => i.availableStock === 0).map((i) => i.productId))
}

export function investigateSalesDecline(ctx: Context): Investigation {
  const { store } = ctx
  const facts = ctx.revenue.facts
  const findings: Finding[] = []
  const decline = -facts.sales.change

  /* 1–3. Revenue, orders, price */
  findings.push({
    findingId: 'FIND-SD-01',
    title: 'Sales fell by a third',
    severity: 'critical',
    category: 'revenue',
    observation: `Sales fell from ${formatCurrency(facts.sales.previous)} in ${store.manifest.periods.previous.label} to ${formatCurrency(facts.sales.current)} in ${store.manifest.periods.current.label}.`,
    impact: `${formatCurrency(decline)} less in gross order value (${pct(facts.sales.percentChange)}).`,
    evidence: [
      evidence('Sales', `${formatCurrency(facts.sales.previous)} → ${formatCurrency(facts.sales.current)}`, 'assignment_provided'),
      evidence('Change', `${formatCurrencyChange(facts.sales.change)} (${pct(facts.sales.percentChange)})`, 'assignment_provided'),
      evidence(
        'Records check',
        `${formatCurrency(ctx.revenue.records.sales.current)} from ${formatCount(ctx.revenue.records.orders.current)} order records`,
        'derived',
        'The synthetic order records add up to the assignment figures exactly.',
      ),
    ],
    affectedProducts: [],
    possibleCauses: [],
    confidence: 'high',
    dataSource: 'assignment_provided',
    recommendedActions: [],
    requiresSellerInput: false,
  })

  findings.push({
    findingId: 'FIND-SD-02',
    title: 'Fewer orders, same prices',
    severity: 'high',
    category: 'orders',
    observation: `Orders fell from ${formatCount(facts.orders.previous)} to ${formatCount(facts.orders.current)} while the average selling price stayed at ${formatCurrency(facts.averageSellingPrice.current)}.`,
    impact: `The decline is entirely volume: ${formatCount(-facts.orders.change)} fewer orders (${pct(facts.orders.percentChange)}). Prices did not fall.`,
    evidence: [
      evidence('Orders', `${formatCount(facts.orders.previous)} → ${formatCount(facts.orders.current)}`, 'assignment_provided'),
      evidence('Average selling price', `${formatCurrency(facts.averageSellingPrice.previous)} → ${formatCurrency(facts.averageSellingPrice.current)}`, 'assignment_provided'),
    ],
    affectedProducts: [],
    possibleCauses: [{ cause: 'Lower order volume, not discounting or price cuts', status: 'supported', confidence: 'high' }],
    confidence: 'high',
    dataSource: 'assignment_provided',
    recommendedActions: [],
    requiresSellerInput: false,
  })

  /* 4–5. Products losing orders and revenue */
  const losers = ctx.revenue.byProduct.filter((p) => p.change < 0)
  const grossLoss = -losers.reduce((s, p) => s + p.change, 0)
  const gains = ctx.revenue.byProduct.filter((p) => p.change > 0).reduce((s, p) => s + p.change, 0)
  const top: typeof losers = []
  let covered = 0
  for (const p of losers) {
    if (covered >= grossLoss * 0.6) break
    top.push(p)
    covered += -p.change
  }
  findings.push({
    findingId: 'FIND-SD-03',
    title: `${top.length} products account for ${formatPercent(round(covered / grossLoss, 2))} of the lost sales`,
    severity: 'high',
    category: 'revenue',
    observation: `${losers.length} of ${store.products.length} products sold less. The biggest drops were ${top.map((p) => p.productName).join(', ')}.`,
    impact: `Products that declined lost ${formatCurrency(grossLoss)} together; growing products added back ${formatCurrency(gains)}.`,
    evidence: top.map((p) =>
      evidence(
        p.productName,
        `${formatCurrencyChange(p.change)} (${pct(p.percentChange)})`,
        'synthetic_demo',
        `${p.orders.previous} → ${p.orders.current} orders`,
        [p.productId],
      ),
    ),
    affectedProducts: top.map((p) => product(ctx, p.productId, 'Largest revenue loss', p.change)),
    possibleCauses: [],
    confidence: 'high',
    dataSource: 'synthetic_demo',
    recommendedActions: [],
    requiresSellerInput: false,
  })

  /* 8. Inventory */
  const oosProducts = outOfStockProducts(ctx)
  const oosLoss = -losers.filter((p) => oosProducts.has(p.productId)).reduce((s, p) => s + p.change, 0)
  const lost = ctx.inventory.outOfStock
  const lostOrders = lost.reduce((s, i) => s + i.estimatedLostOrders, 0)
  const lostSales = lost.reduce((s, i) => s + i.estimatedLostSales, 0)
  const oosFacts = ctx.inventory.facts
  findings.push({
    findingId: 'FIND-SD-04',
    title: 'Stockouts on best-selling sizes are a likely contributor',
    // Medium confidence: the overlap is measured, the causal share is not.
    howToState: `Out-of-stock variants rose from ${oosFacts.previous} to ${oosFacts.current}. Say stockouts are a likely contributing factor, not a proven cause, and never the main, biggest or clearest driver: measuring their contribution needs product-level demand, availability and lost-order evidence, and the lost-order figure here is only an estimate.`,
    severity: 'high',
    category: 'inventory',
    observation: `Out-of-stock SKUs rose from ${oosFacts.previous} to ${oosFacts.current}. Products with a SKU out of stock account for ${formatCurrency(oosLoss)} (${formatPercent(round(ratioOrZero(oosLoss, grossLoss), 2))}) of the lost sales.`,
    impact: `At their in-stock order rate, the out-of-stock SKUs missed an estimated ${formatDecimal(round(lostOrders, 0))} orders (about ${formatCurrency(lostSales)}) in October. This is an estimate, not a measured figure.`,
    evidence: [
      evidence('Out-of-stock SKUs', `${oosFacts.previous} → ${oosFacts.current}`, 'assignment_provided'),
      evidence('Lost sales on products with stockouts', formatCurrency(oosLoss), 'derived', 'Revenue change of products that have at least one SKU out of stock.'),
      ...lost.slice(0, 4).map((i) =>
        evidence(
          `${i.productName} (${i.variantLabel})`,
          `${i.daysOutOfStock} days out of stock`,
          'synthetic_demo',
          `~${formatDecimal(i.estimatedLostOrders)} orders missed (estimate)`,
          [i.sku],
        ),
      ),
    ],
    affectedProducts: [...oosProducts].map((id) => product(ctx, id, 'One or more SKUs out of stock')),
    possibleCauses: [
      { cause: 'Best-selling sizes and colours ran out and were not restocked in time', status: 'supported', confidence: 'high' },
      { cause: 'Stockouts explain part, not all, of the decline; other products also fell', status: 'supported', confidence: 'medium' },
      { cause: 'Shoppers who could not find their size may not have come back', status: 'hypothesis', confidence: 'low' },
    ],
    confidence: 'medium',
    dataSource: 'mixed',
    recommendedActions: existingActions(ctx, ACTION_IDS.restockOutOfStock, ACTION_IDS.supplierFollowUp, ACTION_IDS.stopOverselling),
    requiresSellerInput: false,
  })

  /* 6. Visibility */
  const rows = ctx.products.rows
  const impressionChange = (subset: typeof rows) => {
    const prev = subset.reduce((s, r) => s + r.previousImpressions, 0)
    const cur = subset.reduce((s, r) => s + r.impressions, 0)
    return ratioOrZero(cur - prev, prev)
  }
  const withOos = rows.filter((r) => oosProducts.has(r.productId))
  const withoutOos = rows.filter((r) => !oosProducts.has(r.productId))
  const visibilityGap = impressionChange(withOos) - impressionChange(withoutOos)
  findings.push({
    findingId: 'FIND-SD-05',
    title: 'Listings with stockouts were shown less often',
    severity: 'medium',
    category: 'visibility',
    observation: `Impressions fell ${formatPercent(Math.abs(impressionChange(withOos)))} for products with stockouts, against ${formatPercentChange(impressionChange(withoutOos))} for the rest of the catalogue.`,
    impact: 'Fewer impressions means fewer chances to sell, even for sizes still in stock.',
    evidence: withOos
      .filter((r) => r.impressions < r.previousImpressions)
      .sort((a, b) => a.impressions / a.previousImpressions - b.impressions / b.previousImpressions)
      .slice(0, 4)
      .map((r) =>
        evidence(r.productName, `${formatCount(r.previousImpressions)} → ${formatCount(r.impressions)} impressions`, 'synthetic_demo', undefined, [r.productId]),
      ),
    affectedProducts: withOos.map((r) => product(ctx, r.productId, 'Fewer impressions while out of stock')),
    possibleCauses: [
      { cause: 'Out-of-stock variants reduce how often listings are shown', status: 'hypothesis', confidence: 'medium' },
      { cause: 'Changes in advertising or promotions', status: 'hypothesis', confidence: 'low' },
    ],
    confidence: visibilityGap < -0.1 ? 'medium' : 'low',
    dataSource: 'synthetic_demo',
    recommendedActions: existingActions(ctx, ACTION_IDS.restockOutOfStock),
    requiresSellerInput: true,
    sellerQuestion: 'Did you pause or reduce any sponsored listings or promotions in October? Ad spend is not in the data.',
  })

  /* 9. Cancellations */
  const cf = ctx.cancellations.facts
  const byInitiator = (key: string) => ctx.cancellations.breakdown.byInitiator.find((i) => i.label.startsWith(key))
  const seller = byInitiator('Seller')
  const customer = byInitiator('Customer')
  const share = (i: typeof seller) =>
    i ? `${i.count.previous} → ${i.count.current} orders (${formatPercent(i.shareOfOrders.previous)} → ${formatPercent(i.shareOfOrders.current)} of all orders)` : 'not available'
  findings.push({
    findingId: 'FIND-SD-06',
    title: 'Overall cancellations rose; most of the rise is seller-initiated',
    severity: 'high',
    category: 'cancellations',
    observation: `The overall cancellation rate (all initiators) rose from ${formatPercent(cf.previous)} to ${formatPercent(cf.current)} (${formatPointChange(cf.pointChange)}). Seller-initiated cancellations: ${share(seller)}. Customer-initiated: ${share(customer)}.`,
    impact: `${formatCurrency(ctx.cancellations.cancelledValue.current)} of October orders were cancelled. Sales above count orders placed, so cancellations reduce what is actually earned rather than the sales figure itself.`,
    evidence: [
      evidence(OVERALL_CANCELLATION_LABEL, `${formatPercent(cf.previous)} → ${formatPercent(cf.current)}`, 'assignment_provided'),
      ...initiatorEvidence(ctx),
      ...ctx.cancellations.reasons
        .filter((r) => r.change > 0)
        .slice(0, 3)
        .map((r) => evidence(r.key, `${r.previous} → ${r.current}`, 'synthetic_demo')),
    ],
    affectedProducts: ctx.cancellations.byProduct.slice(0, 4).map((p) => product(ctx, p.productId, `${formatPercent(p.rate)} of orders cancelled`)),
    possibleCauses: [
      { cause: 'Orders accepted for stock that had run out', status: 'supported', confidence: 'high' },
      { cause: 'Slow dispatch leading customers to cancel', status: 'supported', confidence: 'medium' },
    ],
    confidence: 'high',
    dataSource: 'mixed',
    recommendedActions: existingActions(ctx, ACTION_IDS.stopOverselling, ACTION_IDS.dispatchDelays),
    requiresSellerInput: false,
  })

  /* 11. Pricing */
  const repriced = ctx.pricing.rows.filter((p) => p.priceChanged)
  for (const p of repriced) {
    const rev = ctx.revenue.byProduct.find((r) => r.productId === p.productId)!
    findings.push({
      findingId: `FIND-SD-07-${p.productId}`,
      title: `${p.productName}: orders fell after a price rise`,
      severity: 'medium',
      category: 'pricing',
      observation: `The price went from ${formatCurrency(p.previousSellingPrice)} to ${formatCurrency(p.currentSellingPrice)}; orders went from ${rev.orders.previous} to ${rev.orders.current} and conversion from ${formatPercent(p.previousConversionRate)} to ${formatPercent(p.conversionRate)}.`,
      impact: `${formatCurrencyChange(rev.change)} in sales for this product.`,
      evidence: [
        evidence('Price', `${formatCurrency(p.previousSellingPrice)} → ${formatCurrency(p.currentSellingPrice)}`, 'synthetic_demo'),
        evidence('Conversion', `${formatPercent(p.previousConversionRate)} → ${formatPercent(p.conversionRate)}`, 'synthetic_demo'),
        ...(p.syntheticMarketReferencePrice
          ? [evidence('Synthetic reference price', formatCurrency(p.syntheticMarketReferencePrice), 'synthetic_demo', 'Not real competitor data.')]
          : []),
      ],
      affectedProducts: [product(ctx, p.productId, 'Price increased', rev.change)],
      possibleCauses: [
        { cause: 'The higher price reduced conversion', status: 'hypothesis', confidence: 'medium' },
      ],
      confidence: 'medium',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.reviewPricing),
      requiresSellerInput: false,
    })
  }

  /* 7. Conversion */
  const leaky = ctx.products.highViewsLowConversion
  if (leaky.length) {
    findings.push({
      findingId: 'FIND-SD-08',
      title: 'Some products attract visitors but few buyers',
      severity: 'low',
      category: 'visibility',
      observation: `${leaky.map((r) => r.productName).join(', ')} had many product views but converted below half the catalogue median.`,
      impact: 'Better conversion on these listings would add orders without extra traffic.',
      evidence: leaky.map((r) =>
        evidence(r.productName, `${formatCount(r.productViews)} views, ${formatPercent(r.conversionRate)} conversion`, 'synthetic_demo', undefined, [r.productId]),
      ),
      affectedProducts: leaky.map((r) => product(ctx, r.productId, 'High views, low conversion')),
      possibleCauses: [
        { cause: 'Price above the synthetic reference', status: 'supported', confidence: 'medium' },
        { cause: 'Photos, title or description not persuasive enough', status: 'hypothesis', confidence: 'low' },
      ],
      confidence: 'medium',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.improveConversion, ACTION_IDS.reviewPricing),
      requiresSellerInput: false,
    })
  }

  /* 10. Returns */
  const rr = ctx.returns.records.rate
  findings.push({
    findingId: 'FIND-SD-09',
    title: 'Returns also rose, which lowers kept sales',
    severity: 'low',
    category: 'returns',
    observation: `The return rate went from ${formatPercent(rr.previous)} to ${formatPercent(rr.current)}.`,
    impact: `Returns do not explain fewer orders, but they reduce net sales: ${formatCurrency(ctx.returns.returnValue.current)} was returned in October.`,
    evidence: [evidence('Return rate', `${formatPercent(rr.previous)} → ${formatPercent(rr.current)}`, 'synthetic_demo')],
    affectedProducts: ctx.returns.byProduct.slice(0, 3).map((p) => product(ctx, p.productId, `${formatPercent(p.rate)} returned`)),
    possibleCauses: [],
    confidence: 'high',
    dataSource: 'synthetic_demo',
    recommendedActions: existingActions(ctx, ACTION_IDS.inspectQuality, ACTION_IDS.sizeGuidance),
    requiresSellerInput: false,
  })

  // The headline finding points at the actions from its contributing findings.
  findings[0].recommendedActions = [...new Set(findings.slice(1).flatMap((f) => f.recommendedActions))]
  findings[0].possibleCauses = [
    { cause: 'Fewer orders at unchanged prices', status: 'supported', confidence: 'high' },
    { cause: 'Out-of-stock best-selling sizes and colours (a likely contributor; share not measured)', status: 'supported', confidence: 'medium' },
    { cause: `More seller-initiated cancellations (${seller?.count.previous ?? 0} → ${seller?.count.current ?? 0} orders)`, status: 'supported', confidence: 'medium' },
    { cause: 'Reduced listing visibility while out of stock', status: 'hypothesis', confidence: 'medium' },
    { cause: 'A price rise on one product', status: 'hypothesis', confidence: 'medium' },
  ]

  const areas = [
    area('Revenue', 'issue_found', `${formatCurrencyChange(facts.sales.change)} (${pct(facts.sales.percentChange)})`),
    area('Order volume', 'issue_found', `${formatCount(facts.orders.previous)} → ${formatCount(facts.orders.current)}`),
    area('Average selling price', 'no_issue', `Unchanged at ${formatCurrency(facts.averageSellingPrice.current)}`),
    area('Products losing revenue', 'issue_found', `${losers.length} of ${store.products.length} products declined`),
    area('Visibility', visibilityGap < -0.1 ? 'issue_found' : 'no_issue', `Impressions ${formatPercentChange(impressionChange(withOos))} on products with stockouts`),
    area('Conversion', leaky.length ? 'issue_found' : 'no_issue', `${leaky.length} products with high views and low conversion`),
    area('Inventory', 'issue_found', `${oosFacts.previous} → ${oosFacts.current} out-of-stock SKUs`),
    area('Cancellations', 'issue_found', `Overall rate ${formatPercent(cf.previous)} → ${formatPercent(cf.current)}; seller-initiated ${seller?.count.previous ?? 0} → ${seller?.count.current ?? 0} orders`),
    area('Returns', rr.pointChange > 2 ? 'issue_found' : 'no_issue', `${formatPercent(rr.previous)} → ${formatPercent(rr.current)} (affects net sales, not order count)`),
    area('Pricing', repriced.length ? 'issue_found' : 'no_issue', `${repriced.length} product price changes`),
  ]

  return investigation(
    ctx,
    'sales-decline',
    'Why have my sales declined?',
    // Measured facts first; causes only as strongly as the evidence allows.
    `Sales fell ${formatPercent(Math.abs(facts.sales.percentChange ?? 0))} (${formatCurrency(decline)}): ${formatCount(-facts.orders.change)} fewer orders at an unchanged ${formatCurrency(facts.averageSellingPrice.current)} average selling price. Out-of-stock variants rose from ${oosFacts.previous} to ${oosFacts.current}, so stockouts are a likely contributing factor, not a proven cause; measuring their share would need product-level demand, availability and lost-order evidence. Seller-initiated cancellations also rose (${seller?.count.previous ?? 0} → ${seller?.count.current ?? 0} orders); the overall cancellation rate went from ${formatPercent(cf.previous)} to ${formatPercent(cf.current)}.`,
    findings,
    areas,
    [
      { topic: 'Market demand', detail: 'There is no category or marketplace-wide trend in the data, so seasonal demand cannot be ruled in or out.' },
      { topic: 'Advertising', detail: 'Sponsored listing spend and promotion history are not in the data.' },
      { topic: 'Visibility detail', detail: 'Impressions and views are monthly totals per product; there is no daily or keyword-level data.' },
    ],
    ctx.revenue.discrepancies.filter((d) => !(d.assignmentValue === d.recordsValue)),
  )
}

export function investigateProductVisibility(ctx: Context): Investigation {
  const findings: Finding[] = []
  const t = ctx.products.thresholds
  const leaky = ctx.products.highViewsLowConversion
  const hidden = ctx.products.highConversionLowVisibility
  const oos = outOfStockProducts(ctx)
  const shrunk = ctx.products.rows
    .filter((r) => oos.has(r.productId) && r.impressions < r.previousImpressions * 0.8)
    .sort((a, b) => a.impressions / a.previousImpressions - b.impressions / b.previousImpressions)

  if (leaky.length) {
    findings.push({
      findingId: 'FIND-VI-01',
      title: 'High views, low conversion',
      severity: 'medium',
      category: 'visibility',
      observation: `${leaky.length} products get at least ${formatDecimal(t.highViewsMultiple)}× the median views but convert at half the median rate or less (median ${formatPercent(t.medianConversion)}).`,
      impact: 'Traffic is reaching these listings and leaving without buying.',
      evidence: leaky.map((r) => {
        const price = ctx.pricing.rows.find((p) => p.productId === r.productId)
        return evidence(
          r.productName,
          `${formatCount(r.productViews)} views, ${formatPercent(r.conversionRate)} conversion`,
          'synthetic_demo',
          price?.priceToReference ? `Priced at ${formatDecimal(price.priceToReference)}× the synthetic reference; rated ${r.rating}` : `Rated ${r.rating}`,
          [r.productId],
        )
      }),
      affectedProducts: leaky.map((r) => product(ctx, r.productId, 'High views, low conversion')),
      possibleCauses: [
        { cause: 'Price above the synthetic reference', status: 'supported', confidence: 'medium' },
        { cause: 'Listing content (photos, title, description) not persuasive', status: 'hypothesis', confidence: 'low' },
      ],
      confidence: 'medium',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.improveConversion, ACTION_IDS.reviewPricing),
      requiresSellerInput: false,
    })
  }

  if (hidden.length) {
    findings.push({
      findingId: 'FIND-VI-02',
      title: 'Strong conversion, little visibility',
      severity: 'medium',
      category: 'visibility',
      observation: `${hidden.map((r) => r.productName).join(' and ')} convert well above the median but receive less than half the median impressions.`,
      impact: 'These are the cheapest products to grow: shoppers who see them tend to buy.',
      evidence: hidden.map((r) =>
        evidence(r.productName, `${formatPercent(r.conversionRate)} conversion on ${formatCount(r.impressions)} impressions`, 'synthetic_demo', undefined, [r.productId]),
      ),
      affectedProducts: hidden.map((r) => product(ctx, r.productId, 'High conversion, low visibility')),
      possibleCauses: [{ cause: 'Few impressions limit sales despite strong conversion', status: 'supported', confidence: 'high' }],
      confidence: 'high',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.boostVisibility),
      requiresSellerInput: false,
    })
  }

  if (shrunk.length) {
    findings.push({
      findingId: 'FIND-VI-03',
      title: 'Products lost impressions while out of stock',
      severity: 'medium',
      category: 'visibility',
      observation: `${shrunk.length} products with out-of-stock SKUs lost more than 20% of their impressions.`,
      impact: 'Restocking may bring visibility back; the data cannot confirm the marketplace’s ranking rules.',
      evidence: shrunk.map((r) =>
        evidence(r.productName, `${formatCount(r.previousImpressions)} → ${formatCount(r.impressions)}`, 'synthetic_demo', undefined, [r.productId]),
      ),
      affectedProducts: shrunk.map((r) => product(ctx, r.productId, 'Impressions fell while out of stock')),
      possibleCauses: [{ cause: 'Out-of-stock variants reduce how often a listing is shown', status: 'hypothesis', confidence: 'medium' }],
      confidence: 'medium',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.restockOutOfStock),
      requiresSellerInput: false,
    })
  }

  return investigation(
    ctx,
    'visibility',
    'Which products have a visibility or conversion problem?',
    `${leaky.length} products get traffic but few orders, ${hidden.length} convert well but are rarely shown, and ${shrunk.length} lost impressions while out of stock.`,
    findings,
    [
      area('Impressions', shrunk.length ? 'issue_found' : 'no_issue', `${shrunk.length} products lost over 20% of impressions`),
      area('Product views', 'no_issue', `Median ${formatCount(t.medianViews)} views per product`),
      area('Clicks', 'no_issue', 'Click-through tracks views closely in this data'),
      area('Conversion', leaky.length ? 'issue_found' : 'no_issue', `Median conversion ${formatPercent(t.medianConversion)}`),
    ],
    [
      { topic: 'Search ranking', detail: 'Keyword rankings and search terms are not in the data.' },
      { topic: 'Advertising', detail: 'Sponsored listing spend is not in the data.' },
    ],
  )
}

export function investigatePricing(ctx: Context): Investigation {
  const findings: Finding[] = []
  const { expensive, thinMargin, belowReference, rows } = ctx.pricing
  const significant = expensive.filter((p) => p.pricingPosition === 'Significantly Expensive')
  const slight = expensive.filter((p) => p.pricingPosition === 'Slightly Expensive')

  for (const p of significant) {
    findings.push({
      findingId: `FIND-PR-01-${p.productId}`,
      title: `${p.productName} is priced well above the reference`,
      severity: 'medium',
      category: 'pricing',
      observation: `${formatCurrency(p.currentSellingPrice)} is ${formatPercent(round((p.priceToReference ?? 1) - 1, 3))} above the synthetic reference of ${formatCurrency(p.syntheticMarketReferencePrice!)}.${p.priceChanged ? ` The price was ${formatCurrency(p.previousSellingPrice)} last month.` : ''}`,
      impact: `Conversion is ${formatPercent(p.conversionRate)} (was ${formatPercent(p.previousConversionRate)}).`,
      evidence: [
        evidence('Price vs reference', `${formatCurrency(p.currentSellingPrice)} vs ${formatCurrency(p.syntheticMarketReferencePrice!)}`, 'synthetic_demo', 'Reference prices are synthetic, not competitor data.'),
        evidence('Conversion', `${formatPercent(p.previousConversionRate)} → ${formatPercent(p.conversionRate)}`, 'synthetic_demo'),
        ...(p.suggestedPriceRange
          ? [evidence('Range to review', `${formatCurrency(p.suggestedPriceRange.min)}–${formatCurrency(p.suggestedPriceRange.max)}`, 'derived', 'Near the reference, keeping at least a 15% gross margin.')]
          : []),
      ],
      affectedProducts: [product(ctx, p.productId, 'Significantly expensive')],
      possibleCauses: [{ cause: 'Price is limiting conversion', status: 'hypothesis', confidence: 'medium' }],
      confidence: 'medium',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.reviewPricing),
      requiresSellerInput: false,
    })
  }

  if (thinMargin.length) {
    findings.push({
      findingId: 'FIND-PR-02',
      title: 'Thin margins on discounted products',
      severity: 'medium',
      category: 'profitability',
      observation: `${thinMargin.map((p) => `${p.productName} (${formatPercent(p.estimatedGrossMargin)} gross margin, ${formatPercent(p.discountPercentage)} off MRP)`).join('; ')}.`,
      impact: 'Platform fees, shipping and advertising are not in the data; after them these products may earn little or nothing.',
      evidence: thinMargin.map((p) =>
        evidence(p.productName, `${formatCurrency(p.currentSellingPrice)} price, ${formatCurrency(p.costPrice)} cost`, 'synthetic_demo', undefined, [p.productId]),
      ),
      affectedProducts: thinMargin.map((p) => product(ctx, p.productId, 'Thin estimated gross margin')),
      possibleCauses: [{ cause: 'Deep discount relative to cost', status: 'supported', confidence: 'high' }],
      confidence: 'high',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.protectMargin),
      requiresSellerInput: true,
      sellerQuestion: 'What are your platform fee and shipping costs per order? They are needed to estimate net profit.',
    })
  }

  if (slight.length) {
    findings.push({
      findingId: 'FIND-PR-03',
      title: 'Slightly above reference',
      severity: 'low',
      category: 'pricing',
      observation: `${slight.map((p) => p.productName).join(', ')} are 5–15% above their synthetic reference prices.`,
      impact: 'Worth checking alongside conversion; not urgent on its own.',
      evidence: slight.map((p) =>
        evidence(p.productName, `${formatDecimal(p.priceToReference ?? 0)}× reference`, 'synthetic_demo', undefined, [p.productId]),
      ),
      affectedProducts: slight.map((p) => product(ctx, p.productId, 'Slightly expensive')),
      possibleCauses: [],
      confidence: 'low',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.reviewPricing),
      requiresSellerInput: false,
    })
  }

  if (belowReference.length) {
    findings.push({
      findingId: 'FIND-PR-04',
      title: 'Priced below the reference',
      severity: 'low',
      category: 'pricing',
      observation: `${belowReference.map((p) => p.productName).join(', ')} sell below their synthetic reference price.`,
      impact: 'There may be room to test a small price increase where conversion is strong.',
      evidence: belowReference.map((p) =>
        evidence(p.productName, `${formatCurrency(p.currentSellingPrice)} vs ${formatCurrency(p.syntheticMarketReferencePrice!)}`, 'synthetic_demo', `Conversion ${formatPercent(p.conversionRate)}`, [p.productId]),
      ),
      affectedProducts: belowReference.map((p) => product(ctx, p.productId, 'Below reference')),
      possibleCauses: [],
      confidence: 'low',
      dataSource: 'synthetic_demo',
      recommendedActions: [],
      requiresSellerInput: false,
    })
  }

  return investigation(
    ctx,
    'pricing',
    'Are any of my prices hurting sales or margin?',
    `${significant.length} product is priced well above the reference, ${thinMargin.length} has a thin margin, and ${slight.length} are slightly above the reference. Reference prices are synthetic.`,
    findings,
    [
      area('Price vs cost', thinMargin.length ? 'issue_found' : 'no_issue', `${thinMargin.length} products under 20% estimated gross margin`),
      area('Price vs reference', expensive.length ? 'issue_found' : 'no_issue', `${expensive.length} products above the competitive band`),
      area('Price changes', rows.some((r) => r.priceChanged) ? 'issue_found' : 'no_issue', `${rows.filter((r) => r.priceChanged).length} price changes this month`),
      area('Reference coverage', rows.some((r) => r.pricingPosition === 'Insufficient Data') ? 'insufficient_data' : 'no_issue', `${rows.filter((r) => r.pricingPosition === 'Insufficient Data').length} products without a reference price`),
    ],
    [
      { topic: 'Competitor prices', detail: 'Reference prices are synthetic demo values. Real competitor prices are not available.' },
      { topic: 'Fees and costs', detail: 'Platform fees, shipping, payment and advertising costs are not in the data, so margins are gross estimates.' },
    ],
  )
}
