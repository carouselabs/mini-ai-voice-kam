import { readFileSync } from 'node:fs'
import type {
  AssignmentFacts,
  CancellationRecord,
  CustomerProfile,
  Dataset,
  DatasetManifest,
  InventoryRecord,
  Order,
  PeriodKey,
  PricingRecord,
  Product,
  Provenance,
  ReturnRecord,
  Review,
  SellerProfile,
  Shipment,
  Supplier,
} from '../../../shared/records.ts'

/** Central source of truth: every analytic, investigation and API response reads from here. */
export interface Store {
  manifest: DatasetManifest
  facts: AssignmentFacts
  seller: SellerProfile
  products: Product[]
  inventory: InventoryRecord[]
  orders: Order[]
  cancellations: CancellationRecord[]
  returns: ReturnRecord[]
  shipments: Shipment[]
  customers: CustomerProfile[]
  suppliers: Supplier[]
  reviews: Review[]
  pricing: PricingRecord[]
  provenance: Record<string, Provenance>
  index: {
    product: Map<string, Product>
    order: Map<string, Order>
    supplier: Map<string, Supplier>
    inventoryBySku: Map<string, InventoryRecord>
    shipmentByOrder: Map<string, Shipment>
    cancellationByOrder: Map<string, CancellationRecord>
    returnByOrder: Map<string, ReturnRecord>
    pricing: Map<string, PricingRecord>
  }
}

export interface RawData {
  manifest: DatasetManifest
  facts: AssignmentFacts
  seller: { provenance: Provenance; record: SellerProfile }
  products: Dataset<Product>
  inventory: Dataset<InventoryRecord>
  orders: Dataset<Order>
  cancellations: Dataset<CancellationRecord>
  returns: Dataset<ReturnRecord>
  shipments: Dataset<Shipment>
  customers: Dataset<CustomerProfile>
  suppliers: Dataset<Supplier>
  reviews: Dataset<Review>
  pricing: Dataset<PricingRecord>
}

const DATA_DIR = new URL('../../data/', import.meta.url)

const FILES: Record<keyof RawData, string> = {
  manifest: 'manifest.json',
  facts: 'assignment-facts.json',
  seller: 'seller.json',
  products: 'products.json',
  inventory: 'inventory.json',
  orders: 'orders.json',
  cancellations: 'cancellations.json',
  returns: 'returns.json',
  shipments: 'shipments.json',
  customers: 'customers.json',
  suppliers: 'suppliers.json',
  reviews: 'reviews.json',
  pricing: 'pricing.json',
}

export function readRawData(): RawData {
  const entries = Object.entries(FILES).map(([key, file]) => [
    key,
    JSON.parse(readFileSync(new URL(file, DATA_DIR), 'utf8')),
  ])
  return Object.fromEntries(entries) as RawData
}

const byKey = <T>(items: T[], key: (item: T) => string) => new Map(items.map((item) => [key(item), item]))

export function createStore(raw: RawData): Store {
  return {
    manifest: raw.manifest,
    facts: raw.facts,
    seller: raw.seller.record,
    products: raw.products.records,
    inventory: raw.inventory.records,
    orders: raw.orders.records,
    cancellations: raw.cancellations.records,
    returns: raw.returns.records,
    shipments: raw.shipments.records,
    customers: raw.customers.records,
    suppliers: raw.suppliers.records,
    reviews: raw.reviews.records,
    pricing: raw.pricing.records,
    provenance: {
      facts: raw.facts.provenance,
      seller: raw.seller.provenance,
      products: raw.products.provenance,
      inventory: raw.inventory.provenance,
      orders: raw.orders.provenance,
      cancellations: raw.cancellations.provenance,
      returns: raw.returns.provenance,
      shipments: raw.shipments.provenance,
      customers: raw.customers.provenance,
      suppliers: raw.suppliers.provenance,
      reviews: raw.reviews.provenance,
      pricing: raw.pricing.provenance,
    },
    index: {
      product: byKey(raw.products.records, (p) => p.productId),
      order: byKey(raw.orders.records, (o) => o.orderId),
      supplier: byKey(raw.suppliers.records, (s) => s.supplierId),
      inventoryBySku: byKey(raw.inventory.records, (i) => i.sku),
      shipmentByOrder: byKey(raw.shipments.records, (s) => s.orderId),
      cancellationByOrder: byKey(raw.cancellations.records, (c) => c.orderId),
      returnByOrder: byKey(raw.returns.records, (r) => r.orderId),
      pricing: byKey(raw.pricing.records, (p) => p.productId),
    },
  }
}

let cached: Store | null = null

export function getStore(): Store {
  cached ??= createStore(readRawData())
  return cached
}

/* ---------- Common selectors ---------- */

export const ordersIn = (store: Store, period: PeriodKey) => store.orders.filter((o) => o.period === period)
export const cancellationsIn = (store: Store, period: PeriodKey) =>
  store.cancellations.filter((c) => c.period === period)
export const returnsIn = (store: Store, period: PeriodKey) => store.returns.filter((r) => r.period === period)
export const shipmentsIn = (store: Store, period: PeriodKey) => store.shipments.filter((s) => s.period === period)
export const productName = (store: Store, productId: string) => store.index.product.get(productId)?.productName ?? productId
/** Orders that reached the customer (including ones later returned). */
export const isDeliveredOrder = (o: Order) => o.actualDeliveryDate !== null
