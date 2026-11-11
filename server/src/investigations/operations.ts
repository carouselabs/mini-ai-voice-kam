import type { Finding, Investigation } from '../../../shared/insights.ts'
import {
  formatCurrency,
  formatDate,
  formatDecimal,
  formatPercent,
  formatPointChange,
} from '../../../shared/format.ts'
import { CUSTOMER_GUARDRAIL } from '../analytics/people.ts'
import { DISPATCH_SLA_HOURS } from '../analytics/delivery.ts'
import { EXPECTATION_REASONS, QUALITY_REASONS } from '../analytics/returns.ts'
import { round } from '../analytics/math.ts'
import type { Context } from '../insights/context.ts'
import { ACTION_IDS, existingActions, qualityProblemNames } from '../insights/recommendations.ts'
import { area, evidence, initiatorEvidence, investigation, OVERALL_CANCELLATION_LABEL, product } from './build.ts'

const current = <T extends { period: string }>(items: T[]) => items.filter((i) => i.period === 'current')

/* ---------- Cancellations ---------- */

export function investigateCancellationSpike(ctx: Context): Investigation {
  const { store } = ctx
  const c = ctx.cancellations
  const findings: Finding[] = []

  findings.push({
    findingId: 'FIND-CA-01',
    title: 'Overall cancellation rate up by 6 points',
    severity: 'high',
    category: 'cancellations',
    observation: `The overall cancellation rate (every cancellation, whoever started it) rose from ${formatPercent(c.facts.previous)} to ${formatPercent(c.facts.current)}.`,
    impact: `${formatPointChange(c.facts.pointChange)}, a ${formatPercent(round(c.facts.relativeChange ?? 0, 3))} relative increase. ${formatCurrency(c.cancelledValue.current)} of October orders were cancelled.`,
    evidence: [
      evidence(OVERALL_CANCELLATION_LABEL, `${formatPercent(c.facts.previous)} → ${formatPercent(c.facts.current)}`, 'assignment_provided'),
      ...initiatorEvidence(ctx),
      evidence(
        'Records',
        `${c.records.previous.cancelled} of ${c.records.previous.orders} → ${c.records.current.cancelled} of ${c.records.current.orders} orders`,
        'synthetic_demo',
        `${formatPercent(c.records.rate.current)} in the records; matches the assignment after rounding.`,
      ),
    ],
    affectedProducts: [],
    possibleCauses: [],
    confidence: 'high',
    dataSource: 'assignment_provided',
    recommendedActions: [],
    requiresSellerInput: false,
  })

  const rising = c.reasons.filter((r) => r.change > 0)
  const falling = c.reasons.filter((r) => r.change < 0)
  const curRecords = current(store.cancellations)
  findings.push({
    findingId: 'FIND-CA-02',
    title: 'The rise is in seller-initiated cancellations',
    severity: 'high',
    category: 'cancellations',
    observation: `${rising.map((r) => `${r.key} (${r.previous} → ${r.current})`).join(', ')} rose, while ${falling.map((r) => `${r.key} (${r.previous} → ${r.current})`).join(', ')} fell.`,
    impact: `Seller-initiated cancellations: ${c.initiators.find((i) => i.key === 'Seller')?.previous ?? 0} → ${c.initiators.find((i) => i.key === 'Seller')?.current ?? 0}. These are within the seller’s control.`,
    evidence: rising.map((r) =>
      evidence(
        r.key,
        `${r.previous} → ${r.current}`,
        'synthetic_demo',
        undefined,
        curRecords.filter((x) => x.cancellationReason === r.key).map((x) => x.cancellationId),
      ),
    ),
    affectedProducts: [],
    possibleCauses: [
      { cause: 'Orders accepted for SKUs that had just run out (Inventory Unavailable)', status: 'supported', confidence: 'high' },
      { cause: 'Orders the seller could not fulfil in time', status: 'supported', confidence: 'high' },
      { cause: 'Customers cancelling after waiting for dispatch (Delivery Delay)', status: 'supported', confidence: 'medium' },
    ],
    confidence: 'high',
    dataSource: 'synthetic_demo',
    recommendedActions: existingActions(ctx, ACTION_IDS.stopOverselling, ACTION_IDS.restockOutOfStock, ACTION_IDS.dispatchDelays),
    requiresSellerInput: false,
  })

  const fast = c.byProcessingTime[0]
  const slow = c.byProcessingTime[c.byProcessingTime.length - 1]
  findings.push({
    findingId: 'FIND-CA-03',
    title: 'Orders that wait longer get cancelled more',
    severity: 'high',
    category: 'delivery',
    observation: `${formatPercent(slow.rate)} of orders that waited over ${DISPATCH_SLA_HOURS} hours were cancelled, against ${formatPercent(fast.rate)} of orders handled within 24 hours.`,
    impact: `${ctx.delivery.dispatchSlaBreaches.current} October shipments missed the ${DISPATCH_SLA_HOURS}-hour dispatch window (${ctx.delivery.dispatchSlaBreaches.previous} in September).`,
    evidence: [
      ...c.byProcessingTime.map((b) =>
        evidence(b.bucket, `${b.cancelled} of ${b.orders} cancelled (${formatPercent(b.rate)})`, 'synthetic_demo'),
      ),
      evidence('Average hours to dispatch', `${formatDecimal(ctx.delivery.averageProcessingHours.previous)} → ${formatDecimal(ctx.delivery.averageProcessingHours.current)}`, 'synthetic_demo'),
    ],
    affectedProducts: ctx.delivery.slowestProducts.slice(0, 4).map((p) => product(ctx, p.productId, `${p.slaBreaches} late dispatches`)),
    possibleCauses: [
      { cause: 'Slow dispatch on some products', status: 'supported', confidence: 'high' },
      { cause: 'Waiting on stock before dispatching', status: 'hypothesis', confidence: 'medium' },
    ],
    confidence: 'medium',
    dataSource: 'synthetic_demo',
    recommendedActions: existingActions(ctx, ACTION_IDS.dispatchDelays),
    requiresSellerInput: true,
    sellerQuestion: 'Was the warehouse short-staffed or waiting on stock in October? Staffing is not in the data.',
  })

  const hot = c.byProduct.filter((p) => p.orders >= 5 && p.rate >= 0.2)
  if (hot.length) {
    findings.push({
      findingId: 'FIND-CA-04',
      title: 'Cancellations cluster in a few products',
      severity: 'medium',
      category: 'cancellations',
      observation: hot.map((p) => `${p.productName}: ${p.cancelled} of ${p.orders} (${formatPercent(p.rate)})`).join('; '),
      impact: 'Fixing these products removes most of the excess cancellations.',
      evidence: hot.map((p) =>
        evidence(p.productName, formatPercent(p.rate), 'synthetic_demo', `Top reason: ${p.topReason ?? 'n/a'}; ${formatPercent(p.previousRate)} last month`, [p.productId]),
      ),
      affectedProducts: hot.map((p) => product(ctx, p.productId, `Top reason: ${p.topReason ?? 'n/a'}`)),
      possibleCauses: [],
      confidence: 'high',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.restockOutOfStock, ACTION_IDS.dispatchDelays),
      requiresSellerInput: false,
    })
  }

  const stages = c.stages
  const before = stages.filter((s) => s.key !== 'After Dispatch').reduce((sum, s) => sum + s.current, 0)
  const after = stages.find((s) => s.key === 'After Dispatch')?.current ?? 0
  findings.push({
    findingId: 'FIND-CA-05',
    title: 'Most cancellations happen before dispatch',
    severity: 'low',
    category: 'cancellations',
    observation: `${before} of ${c.records.current.cancelled} October cancellations happened before dispatch; ${after} after.`,
    impact: 'Most cancellations can be prevented at the seller’s end (stock and dispatch speed) rather than by the courier.',
    evidence: stages.map((s) => evidence(s.key, `${s.previous} → ${s.current}`, 'synthetic_demo')),
    affectedProducts: [],
    possibleCauses: [],
    confidence: 'high',
    dataSource: 'synthetic_demo',
    recommendedActions: [],
    requiresSellerInput: false,
  })

  const quality = curRecords.filter((x) => x.cancellationReason === 'Product Quality Concern')
  const unknown = curRecords.filter((x) => x.cancellationReason === 'Unknown')
  if (c.repeatCustomers.length) {
    findings.push({
      findingId: 'FIND-CA-06',
      title: 'A few customers cancel repeatedly (for human review only)',
      severity: 'low',
      category: 'customers',
      observation: c.repeatCustomers.map((r) => `${r.anonymisedCustomerId}: ${r.cancellations} cancellations (${r.reasons.join(', ')})`).join('; '),
      impact: CUSTOMER_GUARDRAIL,
      evidence: c.repeatCustomers.map((r) => evidence(r.anonymisedCustomerId, `${r.cancellations} cancellations`, 'synthetic_demo')),
      affectedProducts: [],
      possibleCauses: [{ cause: 'Repeated cancellations by the same anonymised customers', status: 'supported', confidence: 'medium' }],
      confidence: 'medium',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.customerReview),
      requiresSellerInput: false,
    })
  }

  return investigation(
    ctx,
    'cancellations',
    'Why are cancellations increasing?',
    `Cancellations rose from ${formatPercent(c.facts.previous)} to ${formatPercent(c.facts.current)}, led by stock that ran out after orders were placed and orders that waited too long for dispatch. Customer-side cancellations actually fell.`,
    findings,
    [
      area('Rate by product', hot.length ? 'issue_found' : 'no_issue', `${hot.length} products at 20% or more`),
      area('Reasons', 'issue_found', `${rising.length} reasons rose`),
      area('Stage', 'no_issue', `${before} before dispatch, ${after} after`),
      area('Processing time', slow.rate > fast.rate ? 'issue_found' : 'no_issue', `${formatPercent(slow.rate)} cancelled after a ${DISPATCH_SLA_HOURS}-hour wait`),
      area('Dispatch delays', ctx.delivery.dispatchSlaBreaches.current > ctx.delivery.dispatchSlaBreaches.previous ? 'issue_found' : 'no_issue', `${ctx.delivery.dispatchSlaBreaches.current} late dispatches`),
      area('Delivery issues', 'no_issue', `${ctx.delivery.cancelledAfterDispatch.current} cancelled in transit`),
      area('Quality complaints', quality.length ? 'issue_found' : 'no_issue', `${quality.length} cancellations for quality concerns`),
      area('Customer patterns', c.repeatCustomers.length ? 'issue_found' : 'no_issue', `${c.repeatCustomers.length} customers with repeated cancellations`),
    ],
    unknown.length
      ? [{ topic: 'Unknown reasons', detail: `${unknown.length} October cancellations have no recorded reason. They stay “Unknown”; no reason is guessed.` }]
      : [],
  )
}

/* ---------- Returns ---------- */

export function investigateReturnSpike(ctx: Context): Investigation {
  const { store } = ctx
  const r = ctx.returns
  const findings: Finding[] = []
  const curReturns = current(store.returns)
  const reviewsFor = (productId: string) => store.reviews.filter((x) => x.productId === productId && x.sentiment !== 'Positive')

  findings.push({
    findingId: 'FIND-RE-01',
    title: 'Return rate almost tripled',
    severity: 'high',
    category: 'returns',
    observation: `The return rate rose from ${formatPercent(r.records.rate.previous)} to ${formatPercent(r.records.rate.current)} (${r.records.previous.returns} → ${r.records.current.returns} returns).`,
    impact: `${formatCurrency(r.returnValue.current)} refunded or due for refund on October orders.`,
    evidence: [
      evidence('Return rate', `${formatPercent(r.records.rate.previous)} → ${formatPercent(r.records.rate.current)}`, 'synthetic_demo', r.definition),
      evidence('Quality complaints', `${r.qualityComplaints.previous} → ${r.qualityComplaints.current}`, 'synthetic_demo'),
    ],
    affectedProducts: r.byProduct.slice(0, 4).map((p) => product(ctx, p.productId, `${formatPercent(p.rate)} returned`)),
    possibleCauses: [],
    confidence: 'high',
    dataSource: 'synthetic_demo',
    recommendedActions: [],
    requiresSellerInput: false,
  })

  // Product-quality problems: defect or quality returns, confirmed at inspection, echoed in reviews.
  for (const p of r.byProduct.filter((x) => x.qualityComplaints >= 2)) {
    const records = curReturns.filter((x) => x.productId === p.productId && (QUALITY_REASONS as readonly string[]).includes(x.returnReason))
    const reviews = reviewsFor(p.productId).filter((x) => x.issueCategory === 'Product Quality' || x.issueCategory === 'Description Mismatch')
    const productRecord = store.index.product.get(p.productId)!
    findings.push({
      findingId: `FIND-RE-02-${p.productId}`,
      title: `${p.productName}: signs of a quality problem`,
      severity: 'high',
      category: 'returns',
      observation: `${p.returns} of ${p.delivered} delivered units came back (${formatPercent(p.rate)}); ${p.qualityComplaints} were for defects or quality. The listing is rated ${productRecord.rating}.`,
      impact: 'Defective units cost the sale, the return shipping and the product rating.',
      evidence: [
        evidence('Quality returns', `${records.length}`, 'synthetic_demo', records.find((x) => x.sellerRemarks)?.sellerRemarks ?? undefined, records.map((x) => x.returnId)),
        ...reviews.map((x) => evidence(`Review (${x.rating}★)`, `“${x.reviewText}”`, 'synthetic_demo', 'Synthetic review text.', [x.reviewId])),
      ],
      affectedProducts: [product(ctx, p.productId, 'Quality complaints')],
      possibleCauses: [
        { cause: 'Defects confirmed at inspection on returned units', status: 'supported', confidence: 'high' },
        { cause: 'A faulty production batch', status: 'hypothesis', confidence: 'medium' },
      ],
      confidence: 'medium',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.inspectQuality),
      requiresSellerInput: false,
    })
  }

  // Expectation mismatches: unused items returned for size, colour or description.
  const expectation = curReturns.filter((x) => (EXPECTATION_REASONS as readonly string[]).includes(x.returnReason))
  const expectationProducts = [...new Set(expectation.map((x) => x.productId))]
    .map((id) => ({ id, list: expectation.filter((x) => x.productId === id) }))
    .filter((g) => g.list.length >= 3)
  for (const group of expectationProducts) {
    const p = store.index.product.get(group.id)!
    const reason = group.list[0].returnReason
    const reviews = reviewsFor(group.id).filter((x) => x.issueCategory === 'Sizing' || x.issueCategory === 'Description Mismatch')
    findings.push({
      findingId: `FIND-RE-03-${group.id}`,
      title: `${p.productName}: the listing sets the wrong expectation`,
      severity: 'medium',
      category: 'returns',
      observation: `${group.list.length} October returns for ${reason.toLowerCase()}. Items came back unused, which points to expectation rather than quality.`,
      impact: `The listing says: “${p.description}”. Reviews say otherwise.`,
      evidence: [
        evidence(reason, `${group.list.length} returns`, 'synthetic_demo', undefined, group.list.map((x) => x.returnId)),
        evidence('Condition', `${group.list.filter((x) => x.returnCondition === 'Unused').length} unused`, 'synthetic_demo'),
        ...reviews.map((x) => evidence(`Review (${x.rating}★)`, `“${x.reviewText}”`, 'synthetic_demo', 'Synthetic review text.', [x.reviewId])),
      ],
      affectedProducts: [product(ctx, group.id, reason)],
      possibleCauses: [
        { cause: reason === 'Size Issue' ? 'Size chart or fit guidance does not match the product' : 'Photos or description do not match the product', status: 'supported', confidence: 'medium' },
      ],
      confidence: 'medium',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, reason === 'Size Issue' ? ACTION_IDS.sizeGuidance : ACTION_IDS.colourAccuracy),
      requiresSellerInput: false,
    })
  }

  // Delivery damage, linked to shipments.
  const damaged = curReturns.filter((x) => x.returnReason === 'Damaged During Delivery')
  if (damaged.length) {
    const shipments = damaged.map((x) => store.index.shipmentByOrder.get(x.orderId)).filter(Boolean)
    findings.push({
      findingId: 'FIND-RE-04',
      title: 'Fragile items arrive damaged',
      severity: 'medium',
      category: 'delivery',
      observation: `${damaged.length} October returns arrived damaged, all on fragile homeware.`,
      impact: 'This is a packaging or courier-handling problem, not a product defect.',
      evidence: [
        evidence('Damaged returns', `${damaged.length}`, 'synthetic_demo', undefined, damaged.map((x) => x.returnId)),
        evidence('Shipments marked damaged in transit', `${shipments.filter((s) => s?.deliveryIssue === 'Damaged in Transit').length}`, 'synthetic_demo', undefined, shipments.map((s) => s!.shipmentId)),
        ...reviewsFor('PRD-010').filter((x) => x.issueCategory === 'Packaging').map((x) => evidence(`Review (${x.rating}★)`, `“${x.reviewText}”`, 'synthetic_demo', 'Synthetic review text.', [x.reviewId])),
      ],
      affectedProducts: [...new Set(damaged.map((x) => x.productId))].map((id) => product(ctx, id, 'Damaged in transit')),
      possibleCauses: [
        { cause: 'Basic packaging on fragile items', status: 'supported', confidence: 'medium' },
        { cause: 'Rough handling by the courier', status: 'hypothesis', confidence: 'low' },
      ],
      confidence: 'medium',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.packaging),
      requiresSellerInput: false,
    })
  }

  const repeat = ctx.customers.flagged.filter((c) => c.patternFlag === 'Repeated Returns' || c.patternFlag === 'Requires Human Review')
  if (repeat.length) {
    findings.push({
      findingId: 'FIND-RE-05',
      title: 'Repeated returns from a small number of customers (for human review only)',
      severity: 'low',
      category: 'customers',
      observation: repeat.map((c) => `${c.anonymisedCustomerId}: ${c.evidenceSummary}`).join(' '),
      impact: CUSTOMER_GUARDRAIL,
      evidence: repeat.map((c) => evidence(c.anonymisedCustomerId, c.patternFlag, 'synthetic_demo')),
      affectedProducts: [],
      possibleCauses: [],
      confidence: 'medium',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.customerReview),
      requiresSellerInput: false,
    })
  }

  return investigation(
    ctx,
    'returns',
    'Are customers returning products unnecessarily?',
    `Most returns have a clear cause: ${r.qualityComplaints.current} quality complaints, ${expectation.length} size or colour mismatches and ${damaged.length} delivery damages. Only ${repeat.length} customers show a repeated pattern, which needs human review, not action against them.`,
    findings,
    [
      area('Return rate by product', 'issue_found', `${r.byProduct.filter((p) => p.rate >= 0.2).length} products at 20% or more`),
      area('Reasons', 'issue_found', `${r.reasons.filter((x) => x.change > 0).length} reasons rose`),
      area('Quality complaints', r.qualityComplaints.current > r.qualityComplaints.previous ? 'issue_found' : 'no_issue', `${r.qualityComplaints.previous} → ${r.qualityComplaints.current}`),
      area('Return condition', 'no_issue', r.conditions.map((x) => `${x.key} ${x.count}`).join(', ')),
      area('Description vs complaints', expectationProducts.length ? 'issue_found' : 'no_issue', `${expectationProducts.length} listings with repeated expectation mismatches`),
      area('Delivery damage', damaged.length ? 'issue_found' : 'no_issue', `${damaged.length} damaged in transit`),
      area('Review sentiment', 'issue_found', `${store.reviews.filter((x) => x.sentiment === 'Negative').length} negative of ${store.reviews.length} recent reviews`),
    ],
    r.notes.slice(1).map((detail) => ({ topic: 'Return window', detail })),
  )
}

/* ---------- Inventory ---------- */

export function investigateInventoryRisk(ctx: Context): Investigation {
  const inv = ctx.inventory
  const findings: Finding[] = []

  findings.push({
    findingId: 'FIND-IN-01',
    title: `${inv.facts.current} SKUs out of stock, up from ${inv.facts.previous}`,
    severity: 'critical',
    category: 'inventory',
    observation: `${inv.totals.outOfStock} of ${inv.totals.activeSkus} SKUs have no stock; ${inv.totals.replenishmentPending} of them have a restock on the way.`,
    impact: `An estimated ${formatDecimal(round(inv.outOfStock.reduce((s, i) => s + i.estimatedLostOrders, 0), 0))} orders (about ${formatCurrency(inv.outOfStock.reduce((s, i) => s + i.estimatedLostSales, 0))}) were missed in October. This is an estimate based on each SKU’s in-stock order rate.`,
    evidence: [
      evidence('Out-of-stock SKUs', `${inv.facts.previous} → ${inv.facts.current}`, 'assignment_provided'),
      evidence('Records', `${inv.totals.outOfStock} SKUs at zero stock`, 'synthetic_demo', undefined, inv.outOfStock.map((i) => i.sku)),
    ],
    affectedProducts: [...new Set(inv.outOfStock.map((i) => i.productId))].map((id) => product(ctx, id, 'Out-of-stock SKUs')),
    possibleCauses: [],
    confidence: 'high',
    dataSource: 'assignment_provided',
    recommendedActions: existingActions(ctx, ACTION_IDS.restockOutOfStock, ACTION_IDS.supplierFollowUp),
    requiresSellerInput: false,
  })

  const noPo = inv.outOfStock.filter((i) => i.inTransitStock === 0)
  findings.push({
    findingId: 'FIND-IN-02',
    title: 'Best-sellers ran out with nothing on order',
    severity: 'critical',
    category: 'inventory',
    observation: `${noPo.length} out-of-stock SKUs have no restock in transit. The most urgent: ${noPo.slice(0, 3).map((i) => `${i.productName} (${i.variantLabel})`).join(', ')}.`,
    impact: `About ${formatCurrency(noPo.reduce((s, i) => s + i.estimatedLostSales, 0))} of estimated October sales lost on these SKUs alone.`,
    evidence: noPo.slice(0, 6).map((i) =>
      evidence(
        `${i.productName} (${i.variantLabel})`,
        `out since ${formatDate(i.stockoutDate!)}`,
        'synthetic_demo',
        `${formatDecimal(i.averageDailySales)} sold per day while in stock; ~${formatDecimal(i.estimatedLostOrders)} orders missed (estimate)`,
        [i.sku],
      ),
    ),
    affectedProducts: [...new Set(noPo.map((i) => i.productId))].map((id) => product(ctx, id, 'No restock in transit')),
    possibleCauses: [{ cause: 'No purchase order raised after stock ran low', status: 'supported', confidence: 'high' }],
    confidence: 'high',
    dataSource: 'synthetic_demo',
    recommendedActions: existingActions(ctx, ACTION_IDS.restockOutOfStock),
    requiresSellerInput: true,
    sellerQuestion: 'Have you already placed orders for these SKUs outside the system? Purchase orders are not in the data.',
  })

  const delayed = ctx.store.suppliers.filter((s) => s.supplierStatus === 'Delayed')
  if (delayed.length) {
    findings.push({
      findingId: 'FIND-IN-03',
      title: 'Restocks are late at two suppliers',
      severity: 'high',
      category: 'inventory',
      observation: delayed.map((s) => `${s.supplierName}: ${s.performanceNotes}`).join(' '),
      impact: `${inv.totals.replenishmentPending} SKUs are waiting on these deliveries.`,
      evidence: delayed.map((s) =>
        evidence(s.supplierName, s.expectedRestockDate ? `expected ${formatDate(s.expectedRestockDate)}` : 'no date', 'synthetic_demo', `Usual lead time ${s.averageLeadTime} days`, [s.supplierId]),
      ),
      affectedProducts: delayed.flatMap((s) => s.suppliedProducts).map((id) => product(ctx, id, 'Supplier delayed')),
      possibleCauses: [{ cause: 'Supplier missed its promised date', status: 'supported', confidence: 'high' }],
      confidence: 'high',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.supplierFollowUp),
      requiresSellerInput: false,
    })
  }

  if (inv.atRisk.length) {
    findings.push({
      findingId: 'FIND-IN-04',
      title: 'More SKUs will run out before a reorder can arrive',
      severity: 'high',
      category: 'inventory',
      observation: inv.atRisk
        .map((i) => `${i.productName} (${i.variantLabel}): ${i.availableStock} left, ~${formatDecimal(i.estimatedDaysRemaining ?? 0)} days of cover vs a ${i.supplierLeadTimeDays}-day lead time`)
        .join('; '),
      impact: 'Ordering today is the only way to avoid another gap.',
      evidence: inv.atRisk.map((i) =>
        evidence(`${i.productName} (${i.variantLabel})`, `${formatDecimal(i.estimatedDaysRemaining ?? 0)} days of cover`, 'synthetic_demo', `${i.inventoryStatus}; stock ÷ ${formatDecimal(i.averageDailySales)} sold per day`, [i.sku]),
      ),
      affectedProducts: [...new Set(inv.atRisk.map((i) => i.productId))].map((id) => product(ctx, id, 'Low cover')),
      possibleCauses: [],
      confidence: 'high',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.restockLowCover),
      requiresSellerInput: false,
    })
  }

  const oversold = ctx.store.cancellations.filter((c) => c.period === 'current' && c.cancellationReason === 'Inventory Unavailable')
  if (oversold.length) {
    findings.push({
      findingId: 'FIND-IN-05',
      title: 'Stockouts also caused cancellations',
      severity: 'high',
      category: 'cancellations',
      observation: `${oversold.length} October orders were accepted and then cancelled because the SKU had run out.`,
      impact: `${formatCurrency(oversold.reduce((s, c) => s + c.orderValue, 0))} of orders lost after the customer had already bought.`,
      evidence: [evidence('Inventory Unavailable cancellations', `${oversold.length}`, 'synthetic_demo', undefined, oversold.map((c) => c.cancellationId))],
      affectedProducts: [...new Set(oversold.map((c) => c.productId))].map((id) => product(ctx, id, 'Oversold')),
      possibleCauses: [{ cause: 'Listed stock not updated when the SKU ran out', status: 'supported', confidence: 'medium' }],
      confidence: 'high',
      dataSource: 'synthetic_demo',
      recommendedActions: existingActions(ctx, ACTION_IDS.stopOverselling),
      requiresSellerInput: false,
    })
  }

  const top = inv.replenishmentPriority.slice(0, 5)
  const qualityRisk = qualityProblemNames(ctx, top.slice(0, 3).map((i) => i.productId))
  return investigation(
    ctx,
    'inventory',
    'Which products should I restock first?',
    `Restock first: ${top.slice(0, 3).map((i) => `${i.productName} (${i.variantLabel})`).join(', ')}.${
      qualityRisk.length ? ` Check ${qualityRisk.join(', ')} for defects before reordering; returns show quality complaints.` : ''
    } ${noPo.length} out-of-stock SKUs have nothing on order and ${inv.atRisk.length} more will run out before a reorder arrives.`,
    findings,
    [
      area('Out-of-stock SKUs', 'issue_found', `${inv.totals.outOfStock} of ${inv.totals.activeSkus}`),
      area('Stock cover', inv.atRisk.length ? 'issue_found' : 'no_issue', `${inv.atRisk.length} SKUs below lead time`),
      area('Sales velocity', 'no_issue', 'Daily sales computed from in-stock days only'),
      area('Supplier lead time', delayed.length ? 'issue_found' : 'no_issue', `${delayed.length} suppliers delayed`),
      area('Replenishment status', 'issue_found', `${inv.totals.replenishmentPending} SKUs with stock in transit`),
    ],
    [{ topic: 'Purchase orders', detail: 'Open purchase orders are not in the data, apart from stock already in transit.' }],
  )
}
