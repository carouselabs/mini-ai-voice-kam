/** Result types of the analytics engine. Numbers only; formatting happens at the edge. */
import type { Discrepancy } from './insights.ts'
import type {
  CustomerProfile,
  InventoryStatus,
  ListingStatus,
  Order,
  PeriodKey,
  PricingPosition,
  ProductCategory,
  SourceType,
} from './records.ts'

export type Direction = 'up' | 'down' | 'flat'
export type Polarity = 'higher-is-better' | 'lower-is-better'
export type Tone = 'positive' | 'negative' | 'neutral'

export interface Comparison {
  previous: number
  current: number
  change: number
  /** Ratio; null without a base. */
  percentChange: number | null
  direction: Direction
}

/** For ratios: change in percentage points, plus the relative change. */
export interface RateComparison {
  previous: number
  current: number
  pointChange: number
  relativeChange: number | null
  direction: Direction
}

export interface Breakdown {
  key: string
  previous: number
  current: number
  change: number
}

export interface Share {
  key: string
  count: number
  share: number
}

/* ---------- Overview ---------- */

export type KpiKey = 'sales' | 'orders' | 'averageOrderValue' | 'cancellationRate' | 'returnRate' | 'outOfStockProducts'

export interface KpiMetric {
  key: KpiKey
  label: string
  unit: 'currency' | 'count' | 'percent'
  previous: number
  current: number
  change: number
  percentChange: number | null
  /** Only for rates. */
  pointChange: number | null
  direction: Direction
  polarity: Polarity
  tone: Tone
  source: SourceType
  /** What the records give, when the headline figure comes from the assignment. */
  recordsValue: { previous: number; current: number } | null
  note: string
}

export interface DailyPoint {
  day: number
  previousDate: string | null
  currentDate: string | null
  previousRevenue: number | null
  currentRevenue: number | null
  previousOrders: number | null
  currentOrders: number | null
}

export interface Alert {
  id: string
  category: 'inventory' | 'cancellations' | 'returns' | 'delivery' | 'pricing' | 'visibility' | 'customers'
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  detail: string
  productIds: string[]
}

export interface OrderSummaryRow {
  orderId: string
  orderDate: string
  productId: string
  productName: string
  sku: string
  totalAmount: number
  orderStatus: Order['orderStatus']
  paymentMethod: Order['paymentMethod']
}

export interface OverviewData {
  kpis: KpiMetric[]
  dailyTrend: DailyPoint[]
  statusDistribution: Share[]
  topProducts: ProductPerformanceRow[]
  decliningProducts: ProductPerformanceRow[]
  alerts: Alert[]
  recentOrders: OrderSummaryRow[]
  inventory: { outOfStock: number; lowStock: number; critical: number; replenishmentPending: number; healthy: number; activeSkus: number }
  cancellations: { rate: RateComparison; topReasons: Breakdown[] }
  returns: { rate: RateComparison; topReasons: Breakdown[] }
  discrepancies: Discrepancy[]
}

/* ---------- Revenue and orders ---------- */

export interface RevenueAnalysis {
  definition: string
  facts: { sales: Comparison; orders: Comparison; averageSellingPrice: Comparison }
  records: {
    sales: Comparison
    orders: Comparison
    averageSellingPrice: Comparison
    averageOrderValue: Comparison
    unitsSold: Comparison
    /** Gross minus cancelled and returned orders. */
    netSales: Comparison
  }
  byCategory: Array<{ category: ProductCategory } & Comparison>
  byProduct: Array<{ productId: string; productName: string; category: ProductCategory; orders: Comparison } & Comparison>
  dailyTrend: DailyPoint[]
  weeklyTrend: Array<{ weekStart: string; label: string; revenue: number; orders: number }>
  monthlyTrend: Array<{ period: PeriodKey; label: string; revenue: number; orders: number }>
  discrepancies: Discrepancy[]
}

export interface OrdersAnalysis {
  orders: Comparison
  statusDistribution: Share[]
  fulfilmentDistribution: Share[]
  paymentMix: Array<{ key: string; previous: number; current: number }>
  openOrders: number
  dailyTrend: DailyPoint[]
}

/* ---------- Cancellations ---------- */

export interface CancellationAnalysis {
  definition: string
  facts: RateComparison
  /** Overall rate versus who started the cancellations and when. Keeps "overall" and "seller-initiated" apart. */
  breakdown: {
    overallRate: RateComparison & {
      label: string
      cancelled: { previous: number; current: number }
      orders: { previous: number; current: number }
    }
    byInitiator: Array<{ label: string; count: { previous: number; current: number }; shareOfOrders: RateComparison }>
    byStage: Array<{ label: string; count: { previous: number; current: number } }>
    note: string
  }
  records: { previous: { cancelled: number; orders: number }; current: { cancelled: number; orders: number }; rate: RateComparison }
  cancelledValue: Comparison
  reasons: Breakdown[]
  initiators: Breakdown[]
  stages: Breakdown[]
  byProduct: Array<{
    productId: string
    productName: string
    orders: number
    cancelled: number
    rate: number
    previousRate: number
    topReason: string | null
  }>
  /** Current period. Hours from order to dispatch, or to cancellation if never dispatched. */
  byProcessingTime: Array<{ bucket: string; orders: number; cancelled: number; rate: number }>
  weeklyTrend: Array<{ weekStart: string; label: string; orders: number; cancelled: number; rate: number }>
  repeatCustomers: Array<{ anonymisedCustomerId: string; cancellations: number; reasons: string[] }>
}

/* ---------- Returns ---------- */

export interface ReturnAnalysis {
  definition: string
  records: {
    previous: { returns: number; delivered: number }
    current: { returns: number; delivered: number }
    rate: RateComparison
  }
  returnValue: Comparison
  reasons: Breakdown[]
  byProduct: Array<{
    productId: string
    productName: string
    delivered: number
    returns: number
    rate: number
    previousRate: number
    topReason: string | null
    qualityComplaints: number
  }>
  conditions: Share[]
  refundStatus: Share[]
  qualityComplaints: Comparison
  weeklyTrend: Array<{ weekStart: string; label: string; returns: number }>
  notes: string[]
}

/* ---------- Inventory ---------- */

export interface InventoryRiskItem {
  sku: string
  productId: string
  productName: string
  variantLabel: string
  inventoryStatus: InventoryStatus
  availableStock: number
  averageDailySales: number
  estimatedDaysRemaining: number | null
  supplierLeadTimeDays: number
  inTransitStock: number
  expectedRestockDate: string | null
  stockoutDate: string | null
  /** Out-of-stock days within the current period. */
  daysOutOfStock: number
  /** Estimate: average daily sales × days out of stock this period. */
  estimatedLostOrders: number
  estimatedLostSales: number
  runsOutBeforeReplenishment: boolean
  supplierName: string
  supplierStatus: string
  priorityScore: number
}

export interface InventoryAnalysis {
  facts: Comparison
  totals: {
    activeSkus: number
    outOfStock: number
    outOfStockPrevious: number
    replenishmentPending: number
    critical: number
    lowStock: number
    healthy: number
  }
  /** Available stock × cost price. */
  inventoryValue: number
  outOfStock: InventoryRiskItem[]
  atRisk: InventoryRiskItem[]
  replenishmentPriority: InventoryRiskItem[]
  stockoutHistory: Array<{ date: string; sku: string; productName: string }>
}

/* ---------- Products ---------- */

export type PerformanceStatus = 'Top performer' | 'Healthy' | 'Declining' | 'Needs attention' | 'Out of stock' | 'At risk'

export interface ProductPerformanceRow {
  productId: string
  productName: string
  sku: string
  category: ProductCategory
  sellingPrice: number
  availableStock: number
  listingStatus: ListingStatus
  orders: number
  previousOrders: number
  revenue: number
  previousRevenue: number
  revenueChange: number
  revenuePercentChange: number | null
  conversionRate: number
  previousConversionRate: number
  impressions: number
  previousImpressions: number
  productViews: number
  cancellationRate: number
  returnRate: number
  rating: number
  grossMargin: number
  performanceStatus: PerformanceStatus
  flags: string[]
}

export interface ProductAnalysis {
  rows: ProductPerformanceRow[]
  topByRevenue: ProductPerformanceRow[]
  topByOrders: ProductPerformanceRow[]
  declining: ProductPerformanceRow[]
  highCancellation: ProductPerformanceRow[]
  highReturn: ProductPerformanceRow[]
  lowConversion: ProductPerformanceRow[]
  highViewsLowConversion: ProductPerformanceRow[]
  highConversionLowVisibility: ProductPerformanceRow[]
  highRevenueLowMargin: ProductPerformanceRow[]
  thresholds: Record<string, number>
}

/* ---------- Delivery ---------- */

export interface DeliveryAnalysis {
  definition: string
  onTimeRate: RateComparison
  shipments: Comparison
  delivered: Comparison
  late: Comparison
  averageDelayDays: Comparison
  averageProcessingHours: Comparison
  dispatchSlaBreaches: Comparison
  issues: Breakdown[]
  deliveryRelatedCancellations: Comparison
  cancelledBeforeDispatch: Comparison
  cancelledAfterDispatch: Comparison
  slowestProducts: Array<{ productId: string; productName: string; shipments: number; averageProcessingHours: number; slaBreaches: number }>
  bottleneck: { stage: 'seller_processing' | 'logistics' | 'none'; note: string }
}

/* ---------- Profitability and pricing ---------- */

export interface ProfitabilityRow {
  productId: string
  productName: string
  keptOrders: number
  netRevenue: number
  estimatedCost: number
  estimatedGrossProfit: number
  grossMargin: number
}

export interface ProfitabilityAnalysis {
  note: string
  netRevenue: Comparison
  estimatedCost: Comparison
  estimatedGrossProfit: Comparison
  grossMargin: RateComparison
  rows: ProfitabilityRow[]
}

export interface PricingRow {
  productId: string
  productName: string
  currentSellingPrice: number
  previousSellingPrice: number
  costPrice: number
  syntheticMarketReferencePrice: number | null
  priceToReference: number | null
  pricingPosition: PricingPosition
  suggestedPriceRange: { min: number; max: number } | null
  discountPercentage: number
  estimatedGrossMargin: number
  conversionRate: number
  previousConversionRate: number
  priceChanged: boolean
}

export interface PricingAnalysis {
  note: string
  rows: PricingRow[]
  positions: Share[]
  expensive: PricingRow[]
  thinMargin: PricingRow[]
  belowReference: PricingRow[]
}

/* ---------- Customers, reviews, catalogue ---------- */

export interface CustomerPatternAnalysis {
  guardrail: string
  profilesAnalysed: number
  flagged: CustomerProfile[]
  flagCounts: Share[]
}

export interface ReviewAnalysis {
  note: string
  total: number
  sentiment: Share[]
  issues: Share[]
  byProduct: Array<{ productId: string; productName: string; reviews: number; averageRating: number; negative: number; issues: string[] }>
}

export interface CatalogueHealth {
  products: number
  skus: number
  listingStatus: Share[]
  lowRated: Array<{ productId: string; productName: string; rating: number }>
  zeroOrderProducts: Array<{ productId: string; productName: string; reason: string }>
}
