import { customerPatternFlag, repeatedCount } from '../analytics/customer-rules.ts'
import { estimatedDaysRemaining, inventoryStatus } from '../analytics/inventory-rules.ts'
import { pricingPosition } from '../analytics/pricing-rules.ts'
import { round } from '../analytics/math.ts'
import { ASSIGNMENT_FACTS } from '../data/assignment.ts'
import { isDeliveredOrder, type Store } from '../data/store.ts'
import { contextFor } from '../insights/context.ts'
import { runInvestigation } from '../investigations/index.ts'

export interface QualityCheck {
  id: string
  name: string
  passed: boolean
  detail: string
  failures: string[]
}

export interface QualityReport {
  passed: boolean
  checks: QualityCheck[]
}

type Rule = { id: string; name: string; run: (store: Store) => string[]; detail: string }

const t = (iso: string | null) => (iso === null ? null : Date.parse(iso))

function duplicates(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter((v) => (seen.has(v) ? true : (seen.add(v), false)))
}

/** Walks any value and returns paths of numbers that are NaN or infinite. */
function badNumbers(value: unknown, path = '$', out: string[] = []): string[] {
  if (typeof value === 'number' && !Number.isFinite(value)) out.push(path)
  else if (Array.isArray(value)) value.forEach((v, i) => badNumbers(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) if (k !== 'store') badNumbers(v, `${path}.${k}`, out)
  }
  return out
}

const RULES: Rule[] = [
  {
    id: 'unique-ids',
    name: 'No duplicated IDs',
    detail: 'Products, SKUs, orders, cancellations, returns, shipments, inventory, reviews, suppliers and customers.',
    run: (s) => [
      ...duplicates(s.products.map((p) => p.productId)),
      ...duplicates(s.products.flatMap((p) => p.variants.map((v) => v.sku))),
      ...duplicates(s.orders.map((o) => o.orderId)),
      ...duplicates(s.cancellations.map((c) => c.cancellationId)),
      ...duplicates(s.cancellations.map((c) => c.orderId)).map((id) => `order cancelled twice: ${id}`),
      ...duplicates(s.returns.map((r) => r.returnId)),
      ...duplicates(s.shipments.map((x) => x.shipmentId)),
      ...duplicates(s.inventory.map((i) => i.inventoryId)),
      ...duplicates(s.inventory.map((i) => i.sku)).map((sku) => `two inventory records for ${sku}`),
      ...duplicates(s.reviews.map((r) => r.reviewId)),
      ...duplicates(s.suppliers.map((x) => x.supplierId)),
      ...duplicates(s.customers.map((c) => c.anonymisedCustomerId)),
    ],
  },
  {
    id: 'orders-reference-products',
    name: 'Every order references an existing product and one of its SKUs',
    detail: 'productId exists and the SKU is a variant of that product.',
    run: (s) =>
      s.orders
        .filter((o) => !s.index.product.get(o.productId)?.variants.some((v) => v.sku === o.sku))
        .map((o) => o.orderId),
  },
  {
    id: 'cancellations-reference-orders',
    name: 'Every cancellation references an existing cancelled order',
    detail: 'The order exists, is Cancelled, and has the same product and SKU.',
    run: (s) =>
      s.cancellations
        .filter((c) => {
          const o = s.index.order.get(c.orderId)
          return !o || o.orderStatus !== 'Cancelled' || o.productId !== c.productId || o.sku !== c.sku || o.totalAmount !== c.orderValue
        })
        .map((c) => c.cancellationId)
        .concat(s.orders.filter((o) => o.orderStatus === 'Cancelled' && !s.index.cancellationByOrder.has(o.orderId)).map((o) => `${o.orderId} has no cancellation record`)),
  },
  {
    id: 'returns-reference-orders',
    name: 'Every return references an existing delivered order',
    detail: 'The order exists, was delivered, and is Returned or Return Requested.',
    run: (s) =>
      s.returns
        .filter((r) => {
          const o = s.index.order.get(r.orderId)
          return !o || !isDeliveredOrder(o) || !['Returned', 'Return Requested'].includes(o.orderStatus) || o.productId !== r.productId
        })
        .map((r) => r.returnId),
  },
  {
    id: 'inventory-reference-skus',
    name: 'Every inventory record references an existing SKU, and every SKU has one',
    detail: 'One inventory record per product variant.',
    run: (s) => [
      ...s.inventory
        .filter((i) => !s.index.product.get(i.productId)?.variants.some((v) => v.sku === i.sku))
        .map((i) => i.inventoryId),
      ...s.products.flatMap((p) => p.variants).filter((v) => !s.index.inventoryBySku.has(v.sku)).map((v) => `${v.sku} has no inventory`),
    ],
  },
  {
    id: 'shipments-reference-orders',
    name: 'Every shipment references an existing dispatched order',
    detail: 'The order exists and has the same dispatch date.',
    run: (s) =>
      s.shipments
        .filter((x) => {
          const o = s.index.order.get(x.orderId)
          return !o || o.dispatchDate !== x.dispatchDate || o.productId !== x.productId
        })
        .map((x) => x.shipmentId),
  },
  {
    id: 'suppliers-and-reviews',
    name: 'Supplier and review references are valid',
    detail: 'Each product’s supplier exists; each review is for a product the anonymised customer ordered.',
    run: (s) => [
      ...s.products.filter((p) => !s.index.supplier.has(p.supplierId)).map((p) => `${p.productId} supplier ${p.supplierId}`),
      ...s.suppliers.flatMap((x) => x.suppliedProducts.filter((id) => s.index.product.get(id)?.supplierId !== x.supplierId).map((id) => `${x.supplierId} lists ${id}`)),
      ...s.reviews
        .filter((r) => !s.orders.some((o) => o.productId === r.productId && o.anonymisedCustomerId === r.anonymisedCustomerId))
        .map((r) => r.reviewId),
    ],
  },
  {
    id: 'dates-consistent',
    name: 'Dates are logically consistent',
    detail: 'Orders fall in their period; dispatch ≤ delivery; cancelled orders are never delivered; returns follow delivery; nothing is after the data refresh.',
    run: (s) => {
      const asOf = Date.parse(s.manifest.lastUpdatedAt)
      const failures: string[] = []
      for (const o of s.orders) {
        const period = s.manifest.periods[o.period]
        const day = new Date(Date.parse(o.orderDate) + 5.5 * 3_600_000).toISOString().slice(0, 10)
        if (day < period.start || day > period.end) failures.push(`${o.orderId} outside ${o.period}`)
        const ordered = t(o.orderDate)!
        const dispatched = t(o.dispatchDate)
        const delivered = t(o.actualDeliveryDate)
        if (dispatched !== null && dispatched < ordered) failures.push(`${o.orderId} dispatched before ordered`)
        if (delivered !== null && (dispatched === null || delivered < dispatched)) failures.push(`${o.orderId} delivered before dispatch`)
        if (o.orderStatus === 'Cancelled' && delivered !== null) failures.push(`${o.orderId} cancelled but delivered`)
        if (o.cancellationDate && t(o.cancellationDate)! < ordered) failures.push(`${o.orderId} cancelled before ordered`)
        if (o.returnDate && (delivered === null || t(o.returnDate)! < delivered)) failures.push(`${o.orderId} returned before delivery`)
        for (const d of [ordered, dispatched, delivered, t(o.cancellationDate), t(o.returnDate)]) {
          if (d !== null && d > asOf) failures.push(`${o.orderId} has a date after the data refresh`)
        }
      }
      return failures
    },
  },
  {
    id: 'non-negative-values',
    name: 'Prices, quantities and stock are non-negative and totals add up',
    detail: 'totalAmount = sellingPrice × quantity; no negative prices, costs or stock.',
    run: (s) => [
      ...s.orders.filter((o) => o.quantity < 1 || o.sellingPrice < 0 || o.totalAmount !== o.sellingPrice * o.quantity).map((o) => o.orderId),
      ...s.products.filter((p) => p.sellingPrice < 0 || p.costPrice < 0 || p.mrp < p.sellingPrice).map((p) => p.productId),
      ...s.inventory
        .filter((i) => [i.availableStock, i.reservedStock, i.damagedStock, i.inTransitStock, i.averageDailySales].some((n) => n < 0))
        .map((i) => i.inventoryId),
      ...s.returns.filter((r) => r.refundAmount < 0).map((r) => r.returnId),
    ],
  },
  {
    id: 'assignment-facts-unchanged',
    name: 'Assignment figures are unchanged and the records reproduce them',
    detail: 'Sales, orders and ASP match exactly; cancellation rate within rounding; out-of-stock SKUs match.',
    run: (s) => {
      const failures: string[] = []
      const f = s.facts.metrics
      for (const key of Object.keys(ASSIGNMENT_FACTS) as Array<keyof typeof ASSIGNMENT_FACTS>) {
        for (const p of ['previous', 'current'] as const) {
          if (f[key][p] !== ASSIGNMENT_FACTS[key][p]) failures.push(`${key}.${p} changed to ${f[key][p]}`)
        }
      }
      for (const p of ['previous', 'current'] as const) {
        const orders = s.orders.filter((o) => o.period === p)
        const sales = orders.reduce((sum, o) => sum + o.totalAmount, 0)
        if (orders.length !== f.orders[p]) failures.push(`${p} order records ${orders.length}`)
        if (sales !== f.sales[p]) failures.push(`${p} sales records ${sales}`)
        if (round(sales / orders.length, 2) !== f.averageSellingPrice[p]) failures.push(`${p} ASP records ${sales / orders.length}`)
        const rate = s.cancellations.filter((c) => c.period === p).length / orders.length
        if (Math.abs(rate - f.cancellationRate[p]) > 0.005) failures.push(`${p} cancellation rate records ${rate}`)
      }
      if (s.inventory.filter((i) => i.availableStock === 0).length !== f.outOfStockProducts.current) failures.push('current out-of-stock SKUs')
      if (s.inventory.filter((i) => i.outOfStockAtPreviousPeriodEnd).length !== f.outOfStockProducts.previous) failures.push('previous out-of-stock SKUs')
      return failures
    },
  },
  {
    id: 'rates-use-documented-denominators',
    name: 'Stored rates match their documented definitions',
    detail: 'Product cancellation rate = cancelled ÷ orders placed; return rate = returns ÷ delivered orders; customer profiles match their records.',
    run: (s) => {
      const failures: string[] = []
      for (const p of s.products) {
        const cur = s.orders.filter((o) => o.period === 'current' && o.productId === p.productId)
        const cancelled = cur.filter((o) => o.orderStatus === 'Cancelled').length
        const delivered = cur.filter(isDeliveredOrder).length
        const returns = s.returns.filter((r) => r.period === 'current' && r.productId === p.productId).length
        const expectCancel = cur.length ? round(cancelled / cur.length, 4) : 0
        const expectReturn = delivered ? round(returns / delivered, 4) : 0
        if (p.cancellationRate !== expectCancel) failures.push(`${p.productId} cancellationRate ${p.cancellationRate} ≠ ${expectCancel}`)
        if (p.returnRate !== expectReturn) failures.push(`${p.productId} returnRate ${p.returnRate} ≠ ${expectReturn}`)
        if (p.currentPeriodOrders !== cur.length) failures.push(`${p.productId} currentPeriodOrders`)
      }
      for (const c of s.customers) {
        const orders = s.orders.filter((o) => o.anonymisedCustomerId === c.anonymisedCustomerId)
        const cancelled = s.cancellations.filter((x) => x.anonymisedCustomerId === c.anonymisedCustomerId)
        const returned = s.returns.filter((x) => x.anonymisedCustomerId === c.anonymisedCustomerId).length
        const flag = customerPatternFlag({
          totalOrders: orders.length,
          cancelledOrders: cancelled.length,
          returnedOrders: returned,
          duplicateOrderCancellations: cancelled.filter((x) => x.cancellationReason === 'Duplicate Order').length,
        })
        if (orders.length !== c.totalOrders || cancelled.length !== c.cancelledOrders || returned !== c.returnedOrders) failures.push(`${c.anonymisedCustomerId} counts`)
        if (flag !== c.patternFlag) failures.push(`${c.anonymisedCustomerId} flag ${c.patternFlag} ≠ ${flag}`)
        if (repeatedCount(cancelled.length) !== c.repeatedCancellationCount) failures.push(`${c.anonymisedCustomerId} repeated cancellations`)
      }
      return failures
    },
  },
  {
    id: 'derived-fields-follow-rules',
    name: 'Stock statuses, stock cover and pricing positions follow the rules',
    detail: 'Recomputes days remaining, inventory status and pricing position.',
    run: (s) => [
      ...s.inventory
        .filter((i) => {
          const days = estimatedDaysRemaining(i.availableStock, i.averageDailySales)
          return days !== i.estimatedDaysRemaining || inventoryStatus(i) !== i.inventoryStatus
        })
        .map((i) => i.sku),
      ...s.pricing.filter((p) => pricingPosition(p.currentSellingPrice, p.syntheticMarketReferencePrice) !== p.pricingPosition).map((p) => p.productId),
    ],
  },
  {
    id: 'provenance-labelled',
    name: 'Data is labelled with its source',
    detail: 'Assignment facts are assignment_provided; every record is synthetic_demo; the seller is in DEMO mode.',
    run: (s) => {
      const failures: string[] = []
      if (s.facts.provenance.sourceType !== 'assignment_provided') failures.push('facts provenance')
      if (s.seller.dataMode !== 'DEMO') failures.push('seller dataMode')
      const groups = { products: s.products, inventory: s.inventory, orders: s.orders, cancellations: s.cancellations, returns: s.returns, shipments: s.shipments, customers: s.customers, suppliers: s.suppliers, reviews: s.reviews, pricing: s.pricing }
      for (const [name, records] of Object.entries(groups)) {
        if (s.provenance[name]?.sourceType !== 'synthetic_demo') failures.push(`${name} provenance`)
        const bad = (records as Array<{ sourceType: string }>).filter((r) => r.sourceType !== 'synthetic_demo').length
        if (bad) failures.push(`${bad} ${name} records not labelled synthetic_demo`)
      }
      return failures
    },
  },
  {
    id: 'no-invalid-numbers',
    name: 'No division by zero, NaN or infinite values in analytics and investigations',
    detail: 'Scans every analysis and investigation result.',
    run: (s) => {
      const ctx = contextFor(s)
      const scenarios = ['sales-decline', 'cancellations', 'returns', 'inventory', 'visibility', 'pricing', 'overview'] as const
      return [...badNumbers(ctx), ...scenarios.flatMap((sc) => badNumbers(runInvestigation(s, sc), sc))]
    },
  },
]

export function validateStore(store: Store): QualityReport {
  const checks = RULES.map((rule) => {
    const failures = rule.run(store)
    return { id: rule.id, name: rule.name, detail: rule.detail, passed: failures.length === 0, failures: failures.slice(0, 20) }
  })
  return { passed: checks.every((c) => c.passed), checks }
}
