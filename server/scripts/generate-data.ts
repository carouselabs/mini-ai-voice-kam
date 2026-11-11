/**
 * Builds the demo dataset in server/data/*.json from the catalogue design.
 * Deterministic: the same seed always produces the same files.
 *
 *   npm run data:generate -w @mini-ai/server
 *
 * Order counts are solved so the records reproduce the assignment totals exactly:
 * September 400 orders / ₹2,00,000, October 270 orders / ₹1,35,000 (ASP ₹500 both months),
 * 32 and 38 cancellations, 5 and 18 out-of-stock SKUs.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import type {
  AssignmentFacts,
  CancellationReason,
  CancellationRecord,
  CancellationStage,
  CustomerProfile,
  Dataset,
  DatasetManifest,
  DeliveryIssue,
  FulfilmentStatus,
  InventoryRecord,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Period,
  PeriodKey,
  PricingRecord,
  Product,
  Provenance,
  ReturnCondition,
  ReturnReason,
  ReturnRecord,
  Review,
  ReviewIssue,
  SellerProfile,
  Shipment,
  Supplier,
} from '../../shared/records.ts'
import { ASSIGNMENT_FACTS } from '../src/data/assignment.ts'
import { customerPatternFlag, repeatedCount } from '../src/analytics/customer-rules.ts'
import { estimatedDaysRemaining, inventoryStatus } from '../src/analytics/inventory-rules.ts'
import { istDate, round } from '../src/analytics/math.ts'
import { discountFromMrp, grossMargin, pricingPosition, suggestedPriceRange } from '../src/analytics/pricing-rules.ts'
import { PRODUCTS, SUPPLIERS, type ProductSpec, type VariantSpec } from './catalogue.ts'

/* ---------- Constants ---------- */

const SEED = 20261101
const DATASET_VERSION = '2026.11.1'
const GENERATED_AT = '2026-11-01T00:30:00.000Z' // 06:00 IST, 1 Nov 2026
const AS_OF = Date.parse(GENERATED_AT)
const HOUR = 3_600_000
const DAY = 86_400_000
const DELIVERY_PROMISE_DAYS = 5

const PERIODS: Record<PeriodKey, Period> = {
  previous: { key: 'previous', label: 'September 2026', shortLabel: 'Sep 2026', start: '2026-09-01', end: '2026-09-30' },
  current: { key: 'current', label: 'October 2026', shortLabel: 'Oct 2026', start: '2026-10-01', end: '2026-10-31' },
}

const FACTS = ASSIGNMENT_FACTS
const CANCELLATION_COUNTS = { previous: 32, current: 38 }

/* ---------- Seeded randomness ---------- */

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}
const random = mulberry32(SEED)
const between = (min: number, max: number) => min + random() * (max - min)
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1))
const pickOne = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/* ---------- Dates ---------- */

const pad = (n: number) => String(n).padStart(2, '0')
const istIso = (date: string, hour: number, minute = 0) =>
  new Date(`${date}T${pad(hour)}:${pad(minute)}:00+05:30`).toISOString()
const iso = (ms: number) => new Date(ms).toISOString()

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysOf(period: Period): string[] {
  const days: string[] = []
  for (let d = period.start; d <= period.end; d = addDays(d, 1)) days.push(d)
  return days
}

/** In-stock days of a variant within a period. */
function windowFor(variant: VariantSpec, period: Period): string[] {
  const days = daysOf(period)
  if (!variant.stockoutDate) return days
  return days.filter((d) => d <= variant.stockoutDate!)
}

const priceIn = (product: ProductSpec, period: PeriodKey) =>
  period === 'previous' ? (product.previousPrice ?? product.price) : product.price

/* ---------- 1. Solve order counts ---------- */

function solveCounts(period: PeriodKey): Map<string, number> {
  const counts = new Map(PRODUCTS.map((p) => [p.id, p.target[period]]))
  const orderGap = FACTS.orders[period] - PRODUCTS.reduce((s, p) => s + p.target[period], 0)
  const revenueGap = FACTS.sales[period] - PRODUCTS.reduce((s, p) => s + p.target[period] * priceIn(p, period), 0)
  if (orderGap === 0 && revenueGap === 0) return counts

  const flex = PRODUCTS.filter((p) => p.flex)
  const range = [-4, -3, -2, -1, 1, 2, 3, 4]
  let best: { ids: string[]; deltas: number[]; cost: number } | null = null

  const search = (start: number, ids: string[], deltas: number[], size: number) => {
    if (ids.length === size) {
      const n = deltas.reduce((a, b) => a + b, 0)
      const r = deltas.reduce((a, d, i) => a + d * priceIn(PRODUCTS.find((p) => p.id === ids[i])!, period), 0)
      if (n !== orderGap || r !== revenueGap) return
      const cost = deltas.reduce((a, d) => a + Math.abs(d), 0)
      if (!best || cost < best.cost) best = { ids: [...ids], deltas: [...deltas], cost }
      return
    }
    for (let i = start; i < flex.length; i++) {
      for (const d of range) {
        if (flex[i].target[period] + d < 1) continue
        search(i + 1, [...ids, flex[i].id], [...deltas, d], size)
      }
    }
  }
  for (let size = 1; size <= 4 && !best; size++) search(0, [], [], size)
  if (!best) throw new Error(`No order mix reproduces the ${period} assignment totals`)
  const solution = best as { ids: string[]; deltas: number[] }
  solution.ids.forEach((id, i) => counts.set(id, counts.get(id)! + solution.deltas[i]))
  return counts
}

/* ---------- 2. Draft orders ---------- */

interface CancelInfo {
  reason: CancellationReason
  stage: CancellationStage
  initiatedBy: CancellationRecord['cancellationInitiatedBy']
  hours: number
}

interface ReturnInfo {
  reason: ReturnReason
  ms: number
  condition: ReturnCondition
  remarks: string | null
}

interface Draft {
  period: PeriodKey
  product: ProductSpec
  variant: VariantSpec
  sku: string
  price: number
  orderMs: number
  customerId: string
  paymentMethod: PaymentMethod
  processingHours: number
  transitDays: number
  cancel?: CancelInfo
  ret?: ReturnInfo
  issue?: DeliveryIssue
  extraDeliveryDays?: number
  id?: string
}

const usedCustomerIds = new Set<string>()
function newCustomerId(): string {
  for (;;) {
    const id = `CUST-${intBetween(10000, 99999)}`
    if (!usedCustomerIds.has(id)) {
      usedCustomerIds.add(id)
      return id
    }
  }
}

const HOUR_WEIGHTS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map((h) => ({
  h,
  w: h >= 19 && h <= 22 ? 2.2 : h >= 12 && h <= 14 ? 1.5 : 1,
}))

function weightedPick<T>(items: readonly T[], weight: (item: T) => number): T {
  const total = items.reduce((s, item) => s + weight(item), 0)
  let r = random() * total
  for (const item of items) {
    r -= weight(item)
    if (r <= 0) return item
  }
  return items[items.length - 1]
}

const dayWeight = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 || day === 6 ? 1.3 : 1
}

function allocate(total: number, shares: number[]): number[] {
  const sum = shares.reduce((a, b) => a + b, 0)
  if (total === 0 || sum === 0) return shares.map(() => 0)
  const exact = shares.map((s) => (s / sum) * total)
  const floors = exact.map(Math.floor)
  let remaining = total - floors.reduce((a, b) => a + b, 0)
  const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (remaining === 0) break
    if (shares[i] > 0) {
      floors[i]++
      remaining--
    }
  }
  return floors
}

function draftOrders(period: PeriodKey, counts: Map<string, number>): Draft[] {
  const drafts: Draft[] = []
  for (const product of PRODUCTS) {
    const n = counts.get(product.id)!
    const windows = product.variants.map((v) => windowFor(v, PERIODS[period]))
    const perVariant = allocate(
      n,
      product.variants.map((v, i) => v.weight * windows[i].length),
    )
    product.variants.forEach((variant, vi) => {
      for (let k = 0; k < perVariant[vi]; k++) {
        const date = weightedPick(windows[vi], dayWeight)
        const { h } = weightedPick(HOUR_WEIGHTS, (x) => x.w)
        const slow = period === 'current' && random() < (product.slowDispatchShare ?? 0)
        drafts.push({
          period,
          product,
          variant,
          sku: `${product.sku}-${variant.code}`,
          price: priceIn(product, period),
          orderMs: Date.parse(istIso(date, h, intBetween(0, 59))),
          customerId: newCustomerId(),
          paymentMethod: random() < 0.6 ? 'Prepaid' : 'COD',
          processingHours: slow
            ? between(52, 100)
            : product.id === 'PRD-006' && period === 'previous'
              ? between(14, 40)
              : between(4, 30),
          transitDays: between(2, 3.6),
        })
      }
    })
  }
  return drafts.sort((a, b) => a.orderMs - b.orderMs)
}

/* ---------- 3. Cancellations ---------- */

// Fixed anonymised IDs for the customers with designed patterns.
const PATTERN_CUSTOMERS = {
  repeatedCancellations: 'CUST-48213',
  frequentChanges: 'CUST-73390',
  repeatedReturns: 'CUST-15826',
  humanReview: 'CUST-60457',
}
Object.values(PATTERN_CUSTOMERS).forEach((id) => usedCustomerIds.add(id))

interface CancelSlot {
  period: PeriodKey
  reason: CancellationReason
  count: number
  stage: CancellationStage
  initiatedBy: CancellationRecord['cancellationInitiatedBy']
  hours: [number, number]
  filter?: (d: Draft) => boolean
  /** Latest orders first: oversold orders placed as stock ran out. */
  latest?: boolean
  customer?: string
}

const isProduct =
  (...ids: string[]) =>
  (d: Draft) =>
    ids.includes(d.product.id)
const isSku = (sku: string) => (d: Draft) => d.sku === sku

const CANCEL_SLOTS: CancelSlot[] = [
  // September: mostly customer-side reasons.
  { period: 'previous', reason: 'Customer Changed Mind', count: 10, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [2, 20] },
  { period: 'previous', reason: 'Customer Changed Mind', count: 1, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [2, 12], customer: PATTERN_CUSTOMERS.repeatedCancellations },
  { period: 'previous', reason: 'Customer Changed Mind', count: 1, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [2, 12], customer: PATTERN_CUSTOMERS.humanReview },
  { period: 'previous', reason: 'Duplicate Order', count: 4, stage: 'Before Confirmation', initiatedBy: 'Customer', hours: [0.2, 1] },
  { period: 'previous', reason: 'Delivery Delay', count: 2, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [50, 70] },
  { period: 'previous', reason: 'Delivery Delay', count: 2, stage: 'After Dispatch', initiatedBy: 'Customer', hours: [0, 0] },
  { period: 'previous', reason: 'Product Expectation Mismatch', count: 3, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [3, 24] },
  { period: 'previous', reason: 'Payment Issue', count: 3, stage: 'Before Confirmation', initiatedBy: 'Marketplace', hours: [0.3, 1] },
  { period: 'previous', reason: 'Inventory Unavailable', count: 1, stage: 'Before Dispatch', initiatedBy: 'Seller', hours: [6, 26], filter: isSku('UCF-KUR-002-XL'), latest: true },
  { period: 'previous', reason: 'Inventory Unavailable', count: 1, stage: 'Before Dispatch', initiatedBy: 'Seller', hours: [6, 26], filter: isSku('UCF-MOU-020-STD'), latest: true },
  { period: 'previous', reason: 'Seller Could Not Fulfil', count: 1, stage: 'Before Dispatch', initiatedBy: 'Seller', hours: [30, 60], filter: isProduct('PRD-006') },
  { period: 'previous', reason: 'Product Quality Concern', count: 1, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [4, 20], filter: isProduct('PRD-015') },
  { period: 'previous', reason: 'Other', count: 1, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [2, 20] },
  { period: 'previous', reason: 'Unknown', count: 1, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [2, 20] },

  // October: seller-side reasons rise with stockouts and slow dispatch.
  { period: 'current', reason: 'Inventory Unavailable', count: 3, stage: 'Before Dispatch', initiatedBy: 'Seller', hours: [6, 26], filter: isSku('UCF-TSH-001-M'), latest: true },
  { period: 'current', reason: 'Inventory Unavailable', count: 2, stage: 'Before Dispatch', initiatedBy: 'Seller', hours: [6, 26], filter: isSku('UCF-TSH-001-L'), latest: true },
  { period: 'current', reason: 'Inventory Unavailable', count: 3, stage: 'Before Dispatch', initiatedBy: 'Seller', hours: [6, 26], filter: isProduct('PRD-005'), latest: true },
  { period: 'current', reason: 'Inventory Unavailable', count: 1, stage: 'Before Dispatch', initiatedBy: 'Seller', hours: [6, 26], filter: isProduct('PRD-014'), latest: true },
  { period: 'current', reason: 'Inventory Unavailable', count: 2, stage: 'Before Dispatch', initiatedBy: 'Seller', hours: [6, 26], filter: isSku('UCF-EAR-015-BLK'), latest: true },
  { period: 'current', reason: 'Seller Could Not Fulfil', count: 3, stage: 'Before Dispatch', initiatedBy: 'Seller', hours: [30, 80], filter: isProduct('PRD-006') },
  { period: 'current', reason: 'Seller Could Not Fulfil', count: 1, stage: 'Before Dispatch', initiatedBy: 'Seller', hours: [30, 80], filter: isProduct('PRD-003') },
  { period: 'current', reason: 'Seller Could Not Fulfil', count: 1, stage: 'Before Dispatch', initiatedBy: 'Seller', hours: [30, 80], filter: isProduct('PRD-010') },
  { period: 'current', reason: 'Delivery Delay', count: 1, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [52, 100], filter: isProduct('PRD-006') },
  { period: 'current', reason: 'Delivery Delay', count: 2, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [52, 100], filter: isProduct('PRD-002') },
  { period: 'current', reason: 'Delivery Delay', count: 1, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [52, 100], filter: isProduct('PRD-010') },
  { period: 'current', reason: 'Delivery Delay', count: 3, stage: 'After Dispatch', initiatedBy: 'Customer', hours: [0, 0], filter: isProduct('PRD-008', 'PRD-016', 'PRD-013') },
  { period: 'current', reason: 'Customer Changed Mind', count: 3, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [2, 14], customer: PATTERN_CUSTOMERS.repeatedCancellations },
  { period: 'current', reason: 'Customer Changed Mind', count: 1, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [2, 14], customer: PATTERN_CUSTOMERS.humanReview },
  { period: 'current', reason: 'Customer Changed Mind', count: 3, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [2, 20] },
  { period: 'current', reason: 'Product Quality Concern', count: 1, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [4, 20], filter: isProduct('PRD-015') },
  { period: 'current', reason: 'Payment Issue', count: 1, stage: 'Before Confirmation', initiatedBy: 'Marketplace', hours: [0.3, 1] },
  { period: 'current', reason: 'Product Expectation Mismatch', count: 1, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [3, 24], filter: isProduct('PRD-016') },
  { period: 'current', reason: 'Unknown', count: 3, stage: 'Before Dispatch', initiatedBy: 'Customer', hours: [2, 30] },
]

/** Orders that must stay untouched by random picks (duplicate-order originals). */
const reserved = new Set<Draft>()

function applyCancellations(drafts: Draft[]) {
  for (const slot of CANCEL_SLOTS) {
    const maxHours = slot.stage === 'After Dispatch' ? 200 : slot.hours[1]
    let candidates = drafts.filter(
      (d) =>
        d.period === slot.period &&
        !d.cancel &&
        !reserved.has(d) &&
        d.orderMs + maxHours * HOUR < AS_OF &&
        (slot.filter ? slot.filter(d) : !['PRD-005', 'PRD-014', 'PRD-020'].includes(d.product.id)),
    )
    candidates = slot.latest ? [...candidates].sort((a, b) => b.orderMs - a.orderMs) : shuffled(candidates)
    if (candidates.length < slot.count) {
      throw new Error(`Not enough orders for ${slot.period} ${slot.reason} (${candidates.length}/${slot.count})`)
    }
    for (const draft of candidates.slice(0, slot.count)) {
      draft.cancel = {
        reason: slot.reason,
        stage: slot.stage,
        initiatedBy: slot.initiatedBy,
        hours: slot.stage === 'After Dispatch' ? draft.processingHours + between(30, 70) : between(...slot.hours),
      }
      if (slot.reason === 'Payment Issue') draft.paymentMethod = 'Prepaid'
      if (slot.reason === 'Delivery Delay' && slot.stage === 'After Dispatch') draft.processingHours = between(40, 70)
      if (slot.customer) draft.customerId = slot.customer
    }
  }
}

/** Two pairs of near-identical orders a few minutes apart; the second of each pair is cancelled. */
function applyDuplicateOrders(drafts: Draft[], period: PeriodKey, customer: string, productId: string) {
  const pool = shuffled(
    drafts.filter(
      (d) => d.period === period && d.product.id === productId && !d.cancel && d.orderMs < AS_OF - 8 * DAY,
    ),
  )
  for (let pair = 0; pair < 2; pair++) {
    const original = pool[pair * 2]
    const duplicate = pool[pair * 2 + 1]
    reserved.add(original)
    original.customerId = customer
    duplicate.customerId = customer
    duplicate.sku = original.sku
    duplicate.variant = original.variant
    duplicate.orderMs = original.orderMs + 7 * 60_000
    duplicate.cancel = { reason: 'Duplicate Order', stage: 'Before Confirmation', initiatedBy: 'Customer', hours: between(0.2, 0.6) }
  }
}

/* ---------- 4. Fulfilment timeline ---------- */

const expectedMs = (d: Draft) => Date.parse(istIso(addDays(istDate(iso(d.orderMs)), DELIVERY_PROMISE_DAYS), 21))
const dispatchMs = (d: Draft) =>
  d.cancel && d.cancel.stage !== 'After Dispatch' ? null : d.orderMs + d.processingHours * HOUR
const deliveredMs = (d: Draft) =>
  d.cancel ? null : d.orderMs + d.processingHours * HOUR + (d.transitDays + (d.extraDeliveryDays ?? 0)) * DAY
const cancelMs = (d: Draft) => (d.cancel ? d.orderMs + d.cancel.hours * HOUR : null)
const isDelivered = (d: Draft) => {
  const ms = deliveredMs(d)
  return ms !== null && ms <= AS_OF
}

/* ---------- 5. Returns and delivery issues ---------- */

interface ReturnSlot {
  period: PeriodKey
  reason: ReturnReason
  count: number
  filter?: (d: Draft) => boolean
  condition: ReturnCondition
  remarks?: string
  customer?: string
}

const RETURN_SLOTS: ReturnSlot[] = [
  { period: 'previous', reason: 'Size Issue', count: 3, filter: isProduct('PRD-002'), condition: 'Unused' },
  { period: 'previous', reason: 'Product Defect', count: 2, filter: isProduct('PRD-015'), condition: 'Used', remarks: 'Defect confirmed at inspection.' },
  { period: 'previous', reason: 'Colour Mismatch', count: 1, filter: isProduct('PRD-008'), condition: 'Unused' },
  { period: 'previous', reason: 'Damaged During Delivery', count: 2, filter: isProduct('PRD-009'), condition: 'Damaged', remarks: 'Mug chipped in transit.' },
  { period: 'previous', reason: 'Size Issue', count: 1, filter: isProduct('PRD-001'), condition: 'Unused', customer: PATTERN_CUSTOMERS.repeatedReturns },
  { period: 'previous', reason: 'Size Issue', count: 1, filter: isProduct('PRD-001'), condition: 'Unused' },
  { period: 'previous', reason: 'Customer Changed Mind', count: 1, filter: isProduct('PRD-004'), condition: 'Unused', customer: PATTERN_CUSTOMERS.humanReview },
  { period: 'previous', reason: 'Customer Changed Mind', count: 1, filter: isProduct('PRD-004'), condition: 'Unused' },
  { period: 'previous', reason: 'Size Issue', count: 1, filter: isProduct('PRD-006'), condition: 'Unused' },
  { period: 'previous', reason: 'Other', count: 1, filter: isProduct('PRD-013'), condition: 'Unused' },
  { period: 'previous', reason: 'Size Issue', count: 1, filter: isProduct('PRD-003'), condition: 'Unused' },
  { period: 'previous', reason: 'Customer Changed Mind', count: 1, filter: isProduct('PRD-011'), condition: 'Unused' },

  { period: 'current', reason: 'Size Issue', count: 8, filter: isProduct('PRD-002'), condition: 'Unused', remarks: 'Customer reports the kurta runs a size small.' },
  { period: 'current', reason: 'Product Defect', count: 3, filter: isProduct('PRD-015'), condition: 'Used', remarks: 'One earbud does not charge. Defect confirmed at inspection.' },
  { period: 'current', reason: 'Quality Not as Expected', count: 1, filter: isProduct('PRD-015'), condition: 'Used' },
  { period: 'current', reason: 'Colour Mismatch', count: 3, filter: isProduct('PRD-008'), condition: 'Unused', remarks: 'Customer says the blue looks grey compared with the photos.' },
  { period: 'current', reason: 'Colour Mismatch', count: 1, filter: isProduct('PRD-008'), condition: 'Unused', customer: PATTERN_CUSTOMERS.humanReview },
  { period: 'current', reason: 'Damaged During Delivery', count: 3, filter: isProduct('PRD-010'), condition: 'Damaged', remarks: 'Lamp base cracked; outer carton crushed.' },
  { period: 'current', reason: 'Damaged During Delivery', count: 2, filter: isProduct('PRD-009'), condition: 'Damaged', remarks: 'Mug chipped in transit.' },
  { period: 'current', reason: 'Size Issue', count: 1, filter: isProduct('PRD-003'), condition: 'Unused' },
  { period: 'current', reason: 'Size Issue', count: 1, filter: isProduct('PRD-001'), condition: 'Unused' },
  { period: 'current', reason: 'Other', count: 1, filter: isProduct('PRD-013'), condition: 'Unused' },
  { period: 'current', reason: 'Customer Changed Mind', count: 1, filter: isProduct('PRD-004'), condition: 'Unused', customer: PATTERN_CUSTOMERS.repeatedReturns },
  { period: 'current', reason: 'Customer Changed Mind', count: 1, filter: isProduct('PRD-001'), condition: 'Original Packaging Missing', customer: PATTERN_CUSTOMERS.repeatedReturns },
]

function applyReturns(drafts: Draft[]) {
  for (const slot of RETURN_SLOTS) {
    const candidates = shuffled(
      drafts.filter(
        (d) =>
          d.period === slot.period &&
          !d.cancel &&
          !d.ret &&
          !reserved.has(d) &&
          isDelivered(d) &&
          deliveredMs(d)! < AS_OF - 2 * DAY &&
          (!slot.filter || slot.filter(d)),
      ),
    )
    if (candidates.length < slot.count) {
      throw new Error(`Not enough delivered orders for ${slot.period} ${slot.reason} (${candidates.length}/${slot.count})`)
    }
    for (const draft of candidates.slice(0, slot.count)) {
      const delivered = deliveredMs(draft)!
      const ms = Math.min(delivered + between(2, 7) * DAY, AS_OF - between(3, 30) * HOUR)
      draft.ret = { reason: slot.reason, ms, condition: slot.condition, remarks: slot.remarks ?? null }
      if (slot.customer) draft.customerId = slot.customer
      if (slot.reason === 'Damaged During Delivery') draft.issue = 'Damaged in Transit'
    }
  }
}

function applyDeliveryIssues(drafts: Draft[]) {
  const plan: Array<{ period: PeriodKey; issue: DeliveryIssue; count: number }> = [
    { period: 'previous', issue: 'Failed Delivery Attempt', count: 1 },
    { period: 'current', issue: 'Failed Delivery Attempt', count: 2 },
    { period: 'current', issue: 'Address Issue', count: 1 },
  ]
  for (const step of plan) {
    const candidates = shuffled(
      drafts.filter(
        (d) => d.period === step.period && !d.cancel && !d.ret && !d.issue && deliveredMs(d)! + 2 * DAY < AS_OF,
      ),
    )
    for (const draft of candidates.slice(0, step.count)) {
      draft.issue = step.issue
      draft.extraDeliveryDays = between(1.2, 2)
    }
  }
}

/* ---------- 6. Customers ---------- */

function assignRepeatCustomers(drafts: Draft[]) {
  const assigned = new Set<Draft>(drafts.filter((d) => Object.values(PATTERN_CUSTOMERS).includes(d.customerId)))
  const free = shuffled(drafts.filter((d) => !d.cancel && !d.ret && !assigned.has(d) && isDelivered(d)))
  const take = (customer: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const draft = free.pop()!
      draft.customerId = customer
      assigned.add(draft)
    }
  }
  take(PATTERN_CUSTOMERS.repeatedCancellations, 1)
  take(PATTERN_CUSTOMERS.repeatedReturns, 2)
  take(PATTERN_CUSTOMERS.humanReview, 1)
  for (let i = 0; i < 11; i++) take(newCustomerId(), intBetween(2, 3))
}

/* ---------- 7. Statuses ---------- */

function statusOf(d: Draft): { order: OrderStatus; payment: PaymentStatus; fulfilment: FulfilmentStatus } {
  const prepaid = d.paymentMethod === 'Prepaid'
  if (d.cancel) {
    return {
      order: 'Cancelled',
      payment: d.cancel.reason === 'Payment Issue' ? 'Payment Failed' : prepaid ? 'Refunded' : 'Not Charged',
      fulfilment: 'Cancelled',
    }
  }
  if (d.ret) {
    const requested = AS_OF - d.ret.ms < 3 * DAY
    return requested
      ? { order: 'Return Requested', payment: prepaid ? 'Paid' : 'COD Collected', fulfilment: 'Return in Transit' }
      : {
          order: 'Returned',
          payment: AS_OF - d.ret.ms > 6 * DAY ? 'Refunded' : 'Refund Initiated',
          fulfilment: 'Returned to Seller',
        }
  }
  const delivered = deliveredMs(d)!
  const dispatched = dispatchMs(d)!
  if (delivered <= AS_OF) return { order: 'Delivered', payment: prepaid ? 'Paid' : 'COD Collected', fulfilment: 'Delivered' }
  if (dispatched <= AS_OF) return { order: 'Shipped', payment: prepaid ? 'Paid' : 'COD Pending', fulfilment: 'In Transit' }
  const age = (AS_OF - d.orderMs) / HOUR
  const order: OrderStatus = age < 2 ? 'New' : age < 10 ? 'Confirmed' : age < 30 ? 'Processing' : 'Ready to Ship'
  return { order, payment: prepaid ? 'Paid' : 'COD Pending', fulfilment: order === 'Ready to Ship' ? 'Packed' : 'Not Started' }
}

/* ---------- Build ---------- */

function provenance(sourceType: Provenance['sourceType'], note: string): Provenance {
  return {
    sourceType,
    generatedAt: GENERATED_AT,
    periodStart: PERIODS.previous.start,
    periodEnd: PERIODS.current.end,
    lastUpdatedAt: GENERATED_AT,
    note,
  }
}

const SYNTHETIC_NOTE = 'Synthetic demo data generated for Mini AI. Not Snapdeal data.'
const dataset = <T>(records: T[], note = SYNTHETIC_NOTE): Dataset<T> => ({
  provenance: provenance('synthetic_demo', note),
  records,
})

function build() {
  const counts = { previous: solveCounts('previous'), current: solveCounts('current') }
  const drafts = [...draftOrders('previous', counts.previous), ...draftOrders('current', counts.current)]

  applyDuplicateOrders(drafts, 'current', PATTERN_CUSTOMERS.frequentChanges, 'PRD-011')
  applyCancellations(drafts)
  applyReturns(drafts)
  applyDeliveryIssues(drafts)
  assignRepeatCustomers(drafts)

  drafts.sort((a, b) => a.orderMs - b.orderMs)
  const seq = { previous: 0, current: 0 }
  for (const d of drafts) {
    seq[d.period]++
    const month = d.period === 'previous' ? '202609' : '202610'
    d.id = `ORD-${month}-${String(seq[d.period]).padStart(4, '0')}`
  }

  const couriers = ['Courier A (demo)', 'Courier B (demo)', 'Courier C (demo)']

  /* Orders */
  const orders: Order[] = drafts.map((d) => {
    const status = statusOf(d)
    const dispatch = dispatchMs(d)
    const delivered = isDelivered(d) ? deliveredMs(d) : null
    return {
      orderId: d.id!,
      orderDate: iso(d.orderMs),
      period: d.period,
      productId: d.product.id,
      sku: d.sku,
      quantity: 1,
      sellingPrice: d.price,
      totalAmount: d.price,
      paymentMethod: d.paymentMethod,
      orderStatus: status.order,
      paymentStatus: status.payment,
      fulfilmentStatus: status.fulfilment,
      dispatchDate: dispatch !== null && dispatch <= AS_OF ? iso(dispatch) : null,
      expectedDeliveryDate: iso(expectedMs(d)),
      actualDeliveryDate: delivered !== null ? iso(delivered) : null,
      cancellationDate: d.cancel ? iso(cancelMs(d)!) : null,
      returnDate: d.ret ? iso(d.ret.ms) : null,
      anonymisedCustomerId: d.customerId,
      sourceType: 'synthetic_demo',
    }
  })

  /* Cancellations */
  const cancellations: CancellationRecord[] = drafts
    .filter((d) => d.cancel)
    .sort((a, b) => cancelMs(a)! - cancelMs(b)!)
    .map((d, i) => ({
      cancellationId: `CAN-${String(i + 1).padStart(4, '0')}`,
      orderId: d.id!,
      productId: d.product.id,
      sku: d.sku,
      anonymisedCustomerId: d.customerId,
      period: d.period,
      cancellationDate: iso(cancelMs(d)!),
      cancellationInitiatedBy: d.cancel!.initiatedBy,
      cancellationStage: d.cancel!.stage,
      cancellationReason: d.cancel!.reason,
      orderValue: d.price,
      dispatchStatus: d.cancel!.stage === 'After Dispatch' ? 'Dispatched' : 'Not Dispatched',
      fulfilmentStatus: 'Cancelled',
      hoursToCancellation: round(d.cancel!.hours, 1),
      sourceType: 'synthetic_demo',
    }))

  /* Returns */
  const returns: ReturnRecord[] = drafts
    .filter((d) => d.ret)
    .sort((a, b) => a.ret!.ms - b.ret!.ms)
    .map((d, i) => {
      const requested = AS_OF - d.ret!.ms < 3 * DAY
      const quality = d.ret!.reason === 'Product Defect' || d.ret!.reason === 'Quality Not as Expected'
      return {
        returnId: `RET-${String(i + 1).padStart(4, '0')}`,
        orderId: d.id!,
        productId: d.product.id,
        sku: d.sku,
        anonymisedCustomerId: d.customerId,
        period: d.period,
        returnDate: iso(d.ret!.ms),
        returnReason: d.ret!.reason,
        returnCondition: requested ? 'Pending Inspection' : d.ret!.condition,
        inspectionStatus: requested ? 'Pending' : 'Passed',
        refundStatus: requested ? 'Pending' : AS_OF - d.ret!.ms > 6 * DAY ? 'Completed' : 'Initiated',
        refundAmount: d.price,
        qualityComplaint: quality,
        sellerRemarks: requested ? null : d.ret!.remarks,
        sourceType: 'synthetic_demo',
      }
    })

  /* Shipments */
  const shipments: Shipment[] = drafts
    .filter((d) => dispatchMs(d) !== null && dispatchMs(d)! <= AS_OF)
    .map((d) => {
      const order = orders.find((o) => o.orderId === d.id)!
      const expected = expectedMs(d)
      const delivered = isDelivered(d) ? deliveredMs(d)! : null
      const late = delivered !== null ? delivered > expected : AS_OF > expected
      const delayDays = late ? Math.ceil(((delivered ?? AS_OF) - expected) / DAY) : 0
      const cancelled = Boolean(d.cancel)
      return {
        shipmentId: d.id!.replace('ORD', 'SHP'),
        orderId: d.id!,
        productId: d.product.id,
        sku: d.sku,
        period: d.period,
        dispatchDate: iso(dispatchMs(d)!),
        expectedDeliveryDate: iso(expected),
        actualDeliveryDate: delivered !== null ? iso(delivered) : null,
        deliveryStatus: cancelled ? 'Cancelled in Transit' : delivered === null ? 'In Transit' : late ? 'Delivered Late' : 'Delivered',
        delayDays: cancelled ? 0 : delayDays,
        deliveryIssue: d.issue ?? (!cancelled && late ? 'Late Delivery' : 'None'),
        fulfilmentStage: order.fulfilmentStatus,
        sellerProcessingTime: round(d.processingHours, 1),
        logisticsDelay: round(Math.max(0, d.transitDays + (d.extraDeliveryDays ?? 0) - 3), 1),
        deliveryPartnerReference: pickOne(couriers),
        sourceType: 'synthetic_demo',
      }
    })

  /* Suppliers */
  const suppliers: Supplier[] = SUPPLIERS.map((s) => ({
    ...s,
    suppliedProducts: PRODUCTS.filter((p) => p.supplierId === s.supplierId).map((p) => p.id),
    sourceType: 'synthetic_demo',
  }))
  const supplierOf = (id: string) => suppliers.find((s) => s.supplierId === id)!

  /* Inventory */
  const nonCancelled = (period: PeriodKey, sku: string) =>
    drafts.filter((d) => d.period === period && d.sku === sku && !d.cancel).length
  const inventory: InventoryRecord[] = []
  for (const product of PRODUCTS) {
    for (const variant of product.variants) {
      const sku = `${product.sku}-${variant.code}`
      const currentDays = windowFor(variant, PERIODS.current).length
      const previousDays = windowFor(variant, PERIODS.previous).length
      const averageDailySales =
        currentDays > 0
          ? round(nonCancelled('current', sku) / currentDays, 2)
          : previousDays > 0
            ? round(nonCancelled('previous', sku) / previousDays, 2)
            : 0
      const leadTime = supplierOf(product.supplierId).averageLeadTime
      const availableStock = variant.stockoutDate ? 0 : (variant.available ?? 0)
      const inTransitStock = variant.inTransit ?? 0
      const reorderLevel = Math.max(5, Math.ceil(averageDailySales * leadTime * 1.2))
      const stock = { availableStock, inTransitStock, reorderLevel, averageDailySales, supplierLeadTimeDays: leadTime }
      inventory.push({
        inventoryId: `INV-${String(inventory.length + 1).padStart(3, '0')}`,
        productId: product.id,
        sku,
        variantLabel: variant.label,
        availableStock,
        reservedStock: orders.filter(
          (o) => o.sku === sku && ['New', 'Confirmed', 'Processing', 'Ready to Ship'].includes(o.orderStatus),
        ).length,
        damagedStock: variant.damaged ?? (random() < 0.2 ? intBetween(1, 2) : 0),
        inTransitStock,
        reorderLevel,
        averageDailySales,
        estimatedDaysRemaining: estimatedDaysRemaining(availableStock, averageDailySales),
        lastRestockedAt: istIso(variant.lastRestocked, 11),
        supplierLeadTimeDays: leadTime,
        stockoutDate: variant.stockoutDate ?? null,
        outOfStockAtPreviousPeriodEnd: Boolean(variant.stockoutDate && variant.stockoutDate <= PERIODS.previous.end),
        expectedRestockDate: variant.expectedRestock ?? null,
        inventoryStatus: inventoryStatus(stock),
        sourceType: 'synthetic_demo',
      })
    }
  }

  /* Products */
  const products: Product[] = PRODUCTS.map((p) => {
    const mine = (period: PeriodKey) => orders.filter((o) => o.productId === p.id && o.period === period)
    const prev = mine('previous')
    const cur = mine('current')
    const views = (period: PeriodKey, n: number) =>
      n > 0 ? Math.round(n / p.conversion[period]) : period === 'current' ? (p.fixedCurrentViews ?? 0) : 0
    const productViews = views('current', cur.length)
    const variantsStock = inventory.filter((i) => i.productId === p.id)
    const outCount = variantsStock.filter((i) => i.availableStock === 0).length
    const curCancelled = cur.filter((o) => o.orderStatus === 'Cancelled').length
    const curDeliveredCohort = cur.filter((o) => o.actualDeliveryDate !== null).length
    const curReturns = returns.filter((r) => r.productId === p.id && r.period === 'current').length
    return {
      productId: p.id,
      sku: p.sku,
      productName: p.name,
      category: p.category,
      subcategory: p.subcategory,
      description: p.description,
      sellingPrice: p.price,
      previousSellingPrice: p.previousPrice ?? p.price,
      costPrice: p.cost,
      mrp: p.mrp,
      variants: p.variants.map((v) => ({ sku: `${p.sku}-${v.code}`, label: v.label, attribute: p.attribute })),
      availableStock: variantsStock.reduce((s, i) => s + i.availableStock, 0),
      reservedStock: variantsStock.reduce((s, i) => s + i.reservedStock, 0),
      supplierId: p.supplierId,
      listingStatus: outCount === 0 ? 'Active' : outCount === variantsStock.length ? 'Out of Stock' : 'Partially Out of Stock',
      rating: p.rating,
      reviewCount: p.reviewCount,
      impressions: p.impressions.current,
      clicks: Math.round(productViews * 0.82),
      productViews,
      conversionRate: productViews > 0 ? round(cur.length / productViews, 4) : 0,
      previousPeriodImpressions: p.impressions.previous,
      previousPeriodProductViews: views('previous', prev.length),
      previousPeriodOrders: prev.length,
      currentPeriodOrders: cur.length,
      previousPeriodRevenue: prev.reduce((s, o) => s + o.totalAmount, 0),
      currentPeriodRevenue: cur.reduce((s, o) => s + o.totalAmount, 0),
      previousPeriodUnitsSold: prev.reduce((s, o) => s + o.quantity, 0),
      currentPeriodUnitsSold: cur.reduce((s, o) => s + o.quantity, 0),
      cancellationRate: cur.length > 0 ? round(curCancelled / cur.length, 4) : 0,
      returnRate: curDeliveredCohort > 0 ? round(curReturns / curDeliveredCohort, 4) : 0,
      listingCreatedAt: p.listingCreatedAt,
      sourceType: 'synthetic_demo',
    }
  })

  /* Customers (anonymised; profiles for customers with more than one order) */
  const byCustomer = new Map<string, Order[]>()
  for (const o of orders) byCustomer.set(o.anonymisedCustomerId, [...(byCustomer.get(o.anonymisedCustomerId) ?? []), o])
  const customers: CustomerProfile[] = [...byCustomer.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([id, list]): CustomerProfile => {
      const cancelled = cancellations.filter((c) => c.anonymisedCustomerId === id)
      const returned = returns.filter((r) => r.anonymisedCustomerId === id)
      const delivered = list.filter((o) => o.actualDeliveryDate !== null)
      const duplicates = cancelled.filter((c) => c.cancellationReason === 'Duplicate Order').length
      const flag = customerPatternFlag({
        totalOrders: list.length,
        cancelledOrders: cancelled.length,
        returnedOrders: returned.length,
        duplicateOrderCancellations: duplicates,
      })
      const latest = (dates: string[]) => (dates.length ? dates.sort().at(-1)! : null)
      return {
        anonymisedCustomerId: id,
        totalOrders: list.length,
        deliveredOrders: delivered.length,
        cancelledOrders: cancelled.length,
        returnedOrders: returned.length,
        cancellationRate: round(cancelled.length / list.length, 4),
        returnRate: delivered.length ? round(returned.length / delivered.length, 4) : 0,
        repeatedCancellationCount: repeatedCount(cancelled.length),
        repeatedReturnCount: repeatedCount(returned.length),
        lastOrderDate: latest(list.map((o) => o.orderDate))!,
        lastCancellationDate: latest(cancelled.map((c) => c.cancellationDate)),
        lastReturnDate: latest(returned.map((r) => r.returnDate)),
        patternFlag: flag,
        evidenceSummary: `${list.length} orders: ${cancelled.length} cancelled${
          cancelled.length ? ` (${[...new Set(cancelled.map((c) => c.cancellationReason))].join(', ')})` : ''
        }, ${returned.length} returned${
          returned.length ? ` (${[...new Set(returned.map((r) => r.returnReason))].join(', ')})` : ''
        }.`,
        sourceType: 'synthetic_demo',
      }
    })
    .sort((a, b) => a.anonymisedCustomerId.localeCompare(b.anonymisedCustomerId))

  /* Reviews (synthetic text) */
  const REVIEWS: Array<{ productId: string; rating: number; text: string; issue: ReviewIssue }> = [
    { productId: 'PRD-015', rating: 1, text: 'Left earbud stopped charging after a week.', issue: 'Product Quality' },
    { productId: 'PRD-015', rating: 2, text: 'Sound keeps cutting out on calls.', issue: 'Product Quality' },
    { productId: 'PRD-015', rating: 2, text: 'Battery drains much faster than the 24 hours claimed.', issue: 'Description Mismatch' },
    { productId: 'PRD-015', rating: 3, text: 'Decent sound for the price, but the case feels flimsy.', issue: 'Product Quality' },
    { productId: 'PRD-002', rating: 2, text: 'Runs small. Ordered L and it fits like an M.', issue: 'Sizing' },
    { productId: 'PRD-002', rating: 2, text: 'Size chart is off; had to return it.', issue: 'Sizing' },
    { productId: 'PRD-002', rating: 4, text: 'Lovely print and soft fabric.', issue: 'None' },
    { productId: 'PRD-008', rating: 2, text: 'The blue looks grey in person, nothing like the photos.', issue: 'Description Mismatch' },
    { productId: 'PRD-008', rating: 3, text: 'Fabric is fine, colour is a bit dull.', issue: 'Description Mismatch' },
    { productId: 'PRD-010', rating: 1, text: 'Arrived with a cracked base. Packaging was very thin.', issue: 'Packaging' },
    { productId: 'PRD-016', rating: 3, text: 'Sound is fine but too pricey for a 10 W speaker.', issue: 'Pricing' },
    { productId: 'PRD-006', rating: 2, text: 'Took nine days to arrive.', issue: 'Delivery' },
    { productId: 'PRD-004', rating: 5, text: 'Comfortable and true to size.', issue: 'None' },
    { productId: 'PRD-011', rating: 5, text: 'Keeps water cold, no leaks.', issue: 'None' },
    { productId: 'PRD-012', rating: 5, text: 'Beautiful fragrance, great gift.', issue: 'None' },
    { productId: 'PRD-018', rating: 4, text: 'Charges my phone quickly.', issue: 'None' },
    { productId: 'PRD-017', rating: 4, text: 'Good value. Heart-rate readings seem accurate.', issue: 'None' },
    { productId: 'PRD-007', rating: 5, text: 'Very comfortable, fits perfectly.', issue: 'None' },
  ]
  const reviewed = new Set<string>()
  const reviews: Review[] = REVIEWS.map((spec, i) => {
    const pool = orders.filter(
      (o) => o.productId === spec.productId && o.actualDeliveryDate !== null && !reviewed.has(o.orderId),
    )
    const recent = pool.filter((o) => o.period === 'current')
    const order = pickOne(recent.length ? recent : pool)
    reviewed.add(order.orderId)
    const reviewMs = Math.min(Date.parse(order.actualDeliveryDate!) + between(1, 4) * DAY, AS_OF - 2 * HOUR)
    return {
      reviewId: `REV-${String(i + 1).padStart(3, '0')}`,
      productId: spec.productId,
      anonymisedCustomerId: order.anonymisedCustomerId,
      rating: spec.rating,
      reviewDate: iso(reviewMs),
      reviewText: spec.text,
      sentiment: spec.rating >= 4 ? 'Positive' : spec.rating === 3 ? 'Neutral' : 'Negative',
      issueCategory: spec.issue,
      sourceType: 'synthetic_demo',
    }
  })

  /* Pricing (synthetic reference prices, not competitor data) */
  const pricing: PricingRecord[] = PRODUCTS.map((p) => ({
    productId: p.id,
    currentSellingPrice: p.price,
    costPrice: p.cost,
    previousSellingPrice: p.previousPrice ?? p.price,
    suggestedPriceRange: suggestedPriceRange(p.referencePrice, p.cost),
    syntheticMarketReferencePrice: p.referencePrice,
    pricingPosition: pricingPosition(p.price, p.referencePrice),
    discountPercentage: discountFromMrp(p.price, p.mrp),
    estimatedGrossMargin: grossMargin(p.price, p.cost),
    sourceType: 'synthetic_demo',
  }))

  const seller: SellerProfile = {
    sellerId: 'DEMO-SELLER-001',
    sellerName: 'UrbanCart Fashion & Lifestyle',
    marketplace: 'Snapdeal',
    businessCategory: ['Fashion', 'Lifestyle', 'Electronics'],
    accountStatus: 'Active',
    registrationDate: '2023-09-18',
    businessLocation: 'Jaipur, Rajasthan',
    accountManager: 'Mini AI Virtual KAM (demo)',
    dataMode: 'DEMO',
    lastDataUpdated: GENERATED_AT,
    sourceType: 'synthetic_demo',
  }

  const facts: AssignmentFacts = {
    provenance: provenance('assignment_provided', 'Aggregate figures from the Mini AI Voice KAM assignment brief.'),
    metrics: structuredClone(FACTS) as AssignmentFacts['metrics'],
  }

  const manifest: DatasetManifest = {
    datasetVersion: DATASET_VERSION,
    seed: SEED,
    generatedAt: GENERATED_AT,
    lastUpdatedAt: GENERATED_AT,
    freshnessWindowDays: 35,
    periods: PERIODS,
    assumptions: [
      '“This month” is October 2026 and “last month” is September 2026; data was refreshed at 06:00 IST on 1 November 2026.',
      'Sales means the gross value of orders placed, including orders later cancelled or returned. This matches the brief: ₹1,35,000 ÷ 270 orders = ₹500 average selling price.',
      'Every order is for one unit, so average selling price equals average order value, as in the brief.',
      'Out-of-stock products are counted per SKU (size or colour variant): 18 of 43 SKUs in October, 5 at the end of September.',
      'Cancellation rate = cancelled orders ÷ orders placed in the same month (order cohort).',
      'Return rate = returns ÷ delivered orders placed in the same month. Late-October orders are still inside the return window.',
      'Return rate, visibility, pricing references, reviews, suppliers and every individual record are synthetic demo data.',
    ],
  }

  return { manifest, seller, facts, products, inventory, orders, cancellations, returns, shipments, customers, suppliers, reviews, pricing, counts }
}

/* ---------- Write and check ---------- */

const out = build()

const check = (label: string, actual: number, expected: number) => {
  if (actual !== expected) throw new Error(`${label}: got ${actual}, expected ${expected}`)
}
for (const period of ['previous', 'current'] as const) {
  const list = out.orders.filter((o) => o.period === period)
  check(`${period} orders`, list.length, FACTS.orders[period])
  check(`${period} sales`, list.reduce((s, o) => s + o.totalAmount, 0), FACTS.sales[period])
  check(`${period} cancellations`, out.cancellations.filter((c) => c.period === period).length, CANCELLATION_COUNTS[period])
}
check('current out-of-stock SKUs', out.inventory.filter((i) => i.availableStock === 0).length, FACTS.outOfStockProducts.current)
check('previous out-of-stock SKUs', out.inventory.filter((i) => i.outOfStockAtPreviousPeriodEnd).length, FACTS.outOfStockProducts.previous)

const dir = new URL('../data/', import.meta.url)
mkdirSync(dir, { recursive: true })
const write = (name: string, value: unknown) =>
  writeFileSync(new URL(name, dir), `${JSON.stringify(value, null, 2)}\n`)

write('manifest.json', out.manifest)
write('assignment-facts.json', out.facts)
write('seller.json', { provenance: provenance('synthetic_demo', SYNTHETIC_NOTE), record: out.seller })
write('products.json', dataset(out.products))
write('inventory.json', dataset(out.inventory))
write('orders.json', dataset(out.orders))
write('cancellations.json', dataset(out.cancellations))
write('returns.json', dataset(out.returns))
write('shipments.json', dataset(out.shipments))
write('customers.json', dataset(out.customers, `${SYNTHETIC_NOTE} Anonymised IDs; profiles for customers with two or more orders.`))
write('suppliers.json', dataset(out.suppliers, `${SYNTHETIC_NOTE} Fictional suppliers; Mini AI never contacts them.`))
write('reviews.json', dataset(out.reviews, `${SYNTHETIC_NOTE} Review text was written for the demo.`))
write('pricing.json', dataset(out.pricing, `${SYNTHETIC_NOTE} Market reference prices are synthetic, not competitor data.`))

/* Summary for a quick sanity read. */
const summary = (period: PeriodKey) => {
  const list = out.orders.filter((o) => o.period === period)
  const cancelled = out.cancellations.filter((c) => c.period === period).length
  const delivered = list.filter((o) => o.actualDeliveryDate !== null).length
  const returned = out.returns.filter((r) => r.period === period).length
  const ships = out.shipments.filter((s) => s.period === period)
  return {
    orders: list.length,
    sales: list.reduce((s, o) => s + o.totalAmount, 0),
    cancelled,
    cancellationRate: round((cancelled / list.length) * 100, 2),
    returned,
    returnRate: round((returned / delivered) * 100, 2),
    late: ships.filter((s) => s.deliveryStatus === 'Delivered Late').length,
    issues: ships.filter((s) => s.deliveryIssue !== 'None').length,
  }
}
console.log('previous', summary('previous'))
console.log('current ', summary('current'))
console.log('counts  ', Object.fromEntries([...out.counts.current.entries()].map(([k, v]) => [k, `${out.counts.previous.get(k)}→${v}`])))
console.log('flags   ', out.customers.map((c) => `${c.anonymisedCustomerId}:${c.patternFlag}`).join(' '))
console.log('stock   ', Object.entries(Object.groupBy(out.inventory, (i) => i.inventoryStatus)).map(([k, v]) => `${k} ${v!.length}`).join(', '))
console.log(`records  orders ${out.orders.length}, cancellations ${out.cancellations.length}, returns ${out.returns.length}, shipments ${out.shipments.length}, inventory ${out.inventory.length}, customers ${out.customers.length}, reviews ${out.reviews.length}`)
