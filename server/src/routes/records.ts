import { Router } from 'express'
import type { InventoryStatus, OrderStatus } from '../../../shared/records.ts'
import { inventoryWithContext } from '../analytics/inventory.ts'
import { getProductPerformance } from '../analytics/products.ts'
import { getStore } from '../data/store.ts'
import { filtersOf, inDateRange, paginate, parseQuery, type ParsedQuery } from '../http/query.ts'
import { notFound, send } from '../http/respond.ts'
import { contextFor } from '../insights/context.ts'

export const recordsRouter = Router()

const ORDER_STATUSES: OrderStatus[] = ['New', 'Confirmed', 'Processing', 'Ready to Ship', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Returned']
const INVENTORY_STATUSES: InventoryStatus[] = ['Healthy', 'Low Stock', 'Critical', 'Out of Stock', 'Replenishment Pending']
const PERFORMANCE_STATUSES = ['Top performer', 'Healthy', 'Declining', 'Needs attention', 'Out of stock', 'At risk']

const inPeriod = (period: string, query: ParsedQuery) => !query.period || query.period === 'all' || query.period === period
const matches = (query: ParsedQuery, ...fields: Array<string | undefined>) =>
  !query.q || fields.some((f) => f?.toLowerCase().includes(query.q!))

/* ---------- Products ---------- */

recordsRouter.get('/products', (req, res) => {
  const store = getStore()
  const query = parseQuery(req, store, ['category', 'status', 'q', 'limit', 'offset'], { statuses: PERFORMANCE_STATUSES })
  const rows = contextFor(store).products.rows.filter(
    (r) =>
      (!query.category || r.category === query.category) &&
      (!query.status || r.performanceStatus === query.status) &&
      matches(query, r.productName, r.sku, r.productId),
  )
  send(res, store, paginate(rows, query), ['synthetic_demo'], { total: rows.length, filters: filtersOf(query) })
})

recordsRouter.get('/products/:productId', (req, res) => {
  const store = getStore()
  parseQuery(req, store, [])
  const detail = getProductPerformance(store, req.params.productId)
  if (!detail) throw notFound(`Product ${req.params.productId}`)
  send(res, store, detail, ['synthetic_demo'])
})

/* ---------- Orders ---------- */

recordsRouter.get('/orders', (req, res) => {
  const store = getStore()
  const query = parseQuery(req, store, ['period', 'status', 'productId', 'startDate', 'endDate', 'q', 'limit', 'offset'], {
    statuses: ORDER_STATUSES,
    defaultLimit: 1000,
  })
  const rows = store.orders
    .filter(
      (o) =>
        inPeriod(o.period, query) &&
        (!query.status || o.orderStatus === query.status) &&
        (!query.productId || o.productId === query.productId) &&
        inDateRange(o.orderDate, query) &&
        matches(query, o.orderId, o.sku, o.anonymisedCustomerId, store.index.product.get(o.productId)?.productName),
    )
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
    .map((o) => ({ ...o, productName: store.index.product.get(o.productId)?.productName ?? o.productId }))
  send(res, store, paginate(rows, query), ['synthetic_demo'], { total: rows.length, filters: filtersOf(query) })
})

recordsRouter.get('/orders/:orderId', (req, res) => {
  const store = getStore()
  parseQuery(req, store, [])
  const order = store.index.order.get(req.params.orderId)
  if (!order) throw notFound(`Order ${req.params.orderId}`)
  send(res, store, {
    order,
    product: store.index.product.get(order.productId) ?? null,
    shipment: store.index.shipmentByOrder.get(order.orderId) ?? null,
    cancellation: store.index.cancellationByOrder.get(order.orderId) ?? null,
    return: store.index.returnByOrder.get(order.orderId) ?? null,
  }, ['synthetic_demo'])
})

/* ---------- Cancellations and returns ---------- */

recordsRouter.get('/cancellations', (req, res) => {
  const store = getStore()
  const query = parseQuery(req, store, ['period', 'productId', 'startDate', 'endDate', 'q', 'limit', 'offset'], { defaultLimit: 1000 })
  const rows = store.cancellations
    .filter(
      (c) =>
        inPeriod(c.period, query) &&
        (!query.productId || c.productId === query.productId) &&
        inDateRange(c.cancellationDate, query) &&
        matches(query, c.cancellationId, c.orderId, c.cancellationReason, store.index.product.get(c.productId)?.productName),
    )
    .sort((a, b) => b.cancellationDate.localeCompare(a.cancellationDate))
    .map((c) => ({ ...c, productName: store.index.product.get(c.productId)?.productName ?? c.productId }))
  send(res, store, paginate(rows, query), ['synthetic_demo'], { total: rows.length, filters: filtersOf(query) })
})

recordsRouter.get('/returns', (req, res) => {
  const store = getStore()
  const query = parseQuery(req, store, ['period', 'productId', 'startDate', 'endDate', 'q', 'limit', 'offset'], { defaultLimit: 1000 })
  const rows = store.returns
    .filter(
      (r) =>
        inPeriod(r.period, query) &&
        (!query.productId || r.productId === query.productId) &&
        inDateRange(r.returnDate, query) &&
        matches(query, r.returnId, r.orderId, r.returnReason, store.index.product.get(r.productId)?.productName),
    )
    .sort((a, b) => b.returnDate.localeCompare(a.returnDate))
    .map((r) => ({ ...r, productName: store.index.product.get(r.productId)?.productName ?? r.productId }))
  send(res, store, paginate(rows, query), ['synthetic_demo'], { total: rows.length, filters: filtersOf(query) })
})

/* ---------- Inventory, customers, suppliers, reviews, shipments ---------- */

recordsRouter.get('/inventory', (req, res) => {
  const store = getStore()
  const query = parseQuery(req, store, ['productId', 'category', 'status', 'q', 'limit', 'offset'], { statuses: INVENTORY_STATUSES })
  const rows = inventoryWithContext(store).filter(
    (i) =>
      (!query.productId || i.productId === query.productId) &&
      (!query.category || store.index.product.get(i.productId)?.category === query.category) &&
      (!query.status || i.inventoryStatus === query.status) &&
      matches(query, i.sku, i.productName, i.supplierName),
  )
  send(res, store, paginate(rows, query), ['synthetic_demo'], { total: rows.length, filters: filtersOf(query) })
})

recordsRouter.get('/customers/patterns', (req, res) => {
  const store = getStore()
  parseQuery(req, store, [])
  send(res, store, contextFor(store).customers, ['synthetic_demo'])
})

recordsRouter.get('/suppliers', (req, res) => {
  const store = getStore()
  parseQuery(req, store, [])
  send(res, store, store.suppliers, ['synthetic_demo'], {
    total: store.suppliers.length,
    notes: ['Fictional suppliers. Mini AI does not contact suppliers.'],
  })
})

recordsRouter.get('/reviews', (req, res) => {
  const store = getStore()
  const query = parseQuery(req, store, ['productId', 'limit', 'offset'])
  const rows = store.reviews
    .filter((r) => !query.productId || r.productId === query.productId)
    .map((r) => ({ ...r, productName: store.index.product.get(r.productId)?.productName ?? r.productId }))
  send(res, store, paginate(rows, query), ['synthetic_demo'], {
    total: rows.length,
    filters: filtersOf(query),
    notes: ['Review text is synthetic.'],
  })
})

recordsRouter.get('/shipments', (req, res) => {
  const store = getStore()
  const query = parseQuery(req, store, ['period', 'productId', 'limit', 'offset'], { defaultLimit: 1000 })
  const rows = store.shipments.filter((s) => inPeriod(s.period, query) && (!query.productId || s.productId === query.productId))
  send(res, store, paginate(rows, query), ['synthetic_demo'], { total: rows.length, filters: filtersOf(query) })
})
