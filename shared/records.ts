/**
 * Dataset record types. Shared by the data generator, the API server and the dashboard.
 * Field names follow the Milestone 2 brief, in camelCase.
 */

/** seller_provided: entered by the seller (tracker, memory); never checked against the data. */
export type SourceType = 'assignment_provided' | 'synthetic_demo' | 'derived' | 'seller_provided'
export type PeriodKey = 'previous' | 'current'

export interface Period {
  key: PeriodKey
  label: string
  shortLabel: string
  /** Inclusive, YYYY-MM-DD (IST calendar days). */
  start: string
  end: string
}

/** Dataset-level provenance. Every record also carries its own `sourceType`. */
export interface Provenance {
  sourceType: SourceType
  generatedAt: string
  periodStart: string
  periodEnd: string
  lastUpdatedAt: string
  note: string
}

export interface Dataset<T> {
  provenance: Provenance
  records: T[]
}

export interface DatasetManifest {
  datasetVersion: string
  seed: number
  generatedAt: string
  /** When the data was last refreshed (end of the reporting month). */
  lastUpdatedAt: string
  /** Data is considered current until this long after lastUpdatedAt (monthly refresh). */
  freshnessWindowDays: number
  periods: { previous: Period; current: Period }
  assumptions: string[]
}

/* ---------- Assignment facts ---------- */

export interface PeriodPair {
  previous: number
  current: number
}

export interface AssignmentFacts {
  provenance: Provenance
  metrics: {
    /** Gross value of orders placed (₹). */
    sales: PeriodPair
    orders: PeriodPair
    /** Ratio 0–1. */
    cancellationRate: PeriodPair
    averageSellingPrice: PeriodPair
    outOfStockProducts: PeriodPair
  }
}

/* ---------- Seller ---------- */

export interface SellerProfile {
  sellerId: string
  sellerName: string
  marketplace: string
  businessCategory: string[]
  accountStatus: 'Active' | 'Suspended' | 'On Hold'
  registrationDate: string
  businessLocation: string
  accountManager: string
  dataMode: 'DEMO'
  lastDataUpdated: string
  sourceType: SourceType
}

/* ---------- Products ---------- */

export type ProductCategory = 'Fashion' | 'Lifestyle' | 'Electronics'
export type ListingStatus = 'Active' | 'Partially Out of Stock' | 'Out of Stock'

export interface ProductVariant {
  sku: string
  label: string
  attribute: 'Size' | 'Colour' | 'Standard'
}

export interface Product {
  productId: string
  /** Parent SKU. Orders and inventory use the variant SKUs in `variants`. */
  sku: string
  productName: string
  category: ProductCategory
  subcategory: string
  /** Listing description used to compare against expectation-related complaints. */
  description: string
  sellingPrice: number
  previousSellingPrice: number
  costPrice: number
  mrp: number
  variants: ProductVariant[]
  availableStock: number
  reservedStock: number
  supplierId: string
  listingStatus: ListingStatus
  /** Listing rating across all time (synthetic). */
  rating: number
  reviewCount: number
  /** Current period. Times shown in search and category listings. */
  impressions: number
  /** Current period. Clicks from a listing to the product page. */
  clicks: number
  /** Current period. Product page views, including direct visits (≥ clicks). */
  productViews: number
  /** Current period orders ÷ product views. */
  conversionRate: number
  previousPeriodImpressions: number
  previousPeriodProductViews: number
  previousPeriodOrders: number
  currentPeriodOrders: number
  /** Gross order value, the same definition as the assignment's "Sales". */
  previousPeriodRevenue: number
  currentPeriodRevenue: number
  previousPeriodUnitsSold: number
  currentPeriodUnitsSold: number
  /** Current period: cancelled orders ÷ orders placed. */
  cancellationRate: number
  /** Current period: returns ÷ delivered orders (order cohort). */
  returnRate: number
  listingCreatedAt: string
  sourceType: SourceType
}

/* ---------- Inventory ---------- */

export type InventoryStatus = 'Healthy' | 'Low Stock' | 'Critical' | 'Out of Stock' | 'Replenishment Pending'

export interface InventoryRecord {
  inventoryId: string
  productId: string
  sku: string
  variantLabel: string
  availableStock: number
  reservedStock: number
  damagedStock: number
  inTransitStock: number
  reorderLevel: number
  averageDailySales: number
  /** availableStock ÷ averageDailySales; null when there are no recent sales. */
  estimatedDaysRemaining: number | null
  lastRestockedAt: string
  supplierLeadTimeDays: number
  /** Date the SKU last reached zero stock, if it is out of stock. */
  stockoutDate: string | null
  outOfStockAtPreviousPeriodEnd: boolean
  expectedRestockDate: string | null
  inventoryStatus: InventoryStatus
  sourceType: SourceType
}

/* ---------- Orders ---------- */

export type OrderStatus =
  | 'New'
  | 'Confirmed'
  | 'Processing'
  | 'Ready to Ship'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'
  | 'Return Requested'
  | 'Returned'

export type PaymentMethod = 'Prepaid' | 'COD'
export type PaymentStatus =
  | 'Paid'
  | 'COD Pending'
  | 'COD Collected'
  | 'Payment Failed'
  | 'Not Charged'
  | 'Refund Initiated'
  | 'Refunded'

export type FulfilmentStatus =
  | 'Not Started'
  | 'Packed'
  | 'In Transit'
  | 'Delivered'
  | 'Cancelled'
  | 'Return in Transit'
  | 'Returned to Seller'

export interface Order {
  orderId: string
  orderDate: string
  period: PeriodKey
  productId: string
  sku: string
  quantity: number
  sellingPrice: number
  totalAmount: number
  paymentMethod: PaymentMethod
  orderStatus: OrderStatus
  paymentStatus: PaymentStatus
  fulfilmentStatus: FulfilmentStatus
  dispatchDate: string | null
  expectedDeliveryDate: string
  actualDeliveryDate: string | null
  cancellationDate: string | null
  returnDate: string | null
  anonymisedCustomerId: string
  sourceType: SourceType
}

/* ---------- Cancellations ---------- */

export type CancellationReason =
  | 'Customer Changed Mind'
  | 'Duplicate Order'
  | 'Delivery Delay'
  | 'Product Expectation Mismatch'
  | 'Product Quality Concern'
  | 'Seller Could Not Fulfil'
  | 'Inventory Unavailable'
  | 'Payment Issue'
  | 'Other'
  | 'Unknown'

export type CancellationStage = 'Before Confirmation' | 'Before Dispatch' | 'After Dispatch'

export interface CancellationRecord {
  cancellationId: string
  orderId: string
  productId: string
  sku: string
  anonymisedCustomerId: string
  period: PeriodKey
  cancellationDate: string
  cancellationInitiatedBy: 'Customer' | 'Seller' | 'Marketplace'
  cancellationStage: CancellationStage
  cancellationReason: CancellationReason
  orderValue: number
  dispatchStatus: 'Not Dispatched' | 'Dispatched'
  fulfilmentStatus: FulfilmentStatus
  /** Hours between the order and its cancellation. */
  hoursToCancellation: number
  sourceType: SourceType
}

/* ---------- Returns ---------- */

export type ReturnReason =
  | 'Product Defect'
  | 'Size Issue'
  | 'Colour Mismatch'
  | 'Different From Description'
  | 'Damaged During Delivery'
  | 'Customer Changed Mind'
  | 'Quality Not as Expected'
  | 'Other'

export type ReturnCondition =
  | 'Unused'
  | 'Used'
  | 'Damaged'
  | 'Wrong Item'
  | 'Missing Parts'
  | 'Original Packaging Missing'
  | 'Pending Inspection'
  | 'Unknown'

export interface ReturnRecord {
  returnId: string
  orderId: string
  productId: string
  sku: string
  anonymisedCustomerId: string
  period: PeriodKey
  returnDate: string
  returnReason: ReturnReason
  returnCondition: ReturnCondition
  inspectionStatus: 'Pending' | 'Passed' | 'Failed' | 'Not Required'
  refundStatus: 'Pending' | 'Initiated' | 'Completed'
  refundAmount: number
  qualityComplaint: boolean
  sellerRemarks: string | null
  sourceType: SourceType
}

/* ---------- Customers ---------- */

export type CustomerPatternFlag =
  | 'Normal'
  | 'Repeated Cancellations'
  | 'Repeated Returns'
  | 'Frequent Order Changes'
  | 'Requires Human Review'

export interface CustomerProfile {
  anonymisedCustomerId: string
  totalOrders: number
  deliveredOrders: number
  cancelledOrders: number
  returnedOrders: number
  cancellationRate: number
  returnRate: number
  repeatedCancellationCount: number
  repeatedReturnCount: number
  lastOrderDate: string
  lastCancellationDate: string | null
  lastReturnDate: string | null
  patternFlag: CustomerPatternFlag
  evidenceSummary: string
  sourceType: SourceType
}

/* ---------- Delivery ---------- */

export type DeliveryStatus = 'In Transit' | 'Delivered' | 'Delivered Late' | 'Cancelled in Transit'
export type DeliveryIssue = 'None' | 'Late Delivery' | 'Damaged in Transit' | 'Failed Delivery Attempt' | 'Address Issue'

export interface Shipment {
  shipmentId: string
  orderId: string
  productId: string
  sku: string
  period: PeriodKey
  dispatchDate: string
  expectedDeliveryDate: string
  actualDeliveryDate: string | null
  deliveryStatus: DeliveryStatus
  /** Whole days after the promised date; 0 when on time or not yet delivered. */
  delayDays: number
  deliveryIssue: DeliveryIssue
  fulfilmentStage: FulfilmentStatus
  /** Hours from order to dispatch. Dispatch is promised within 48 hours. */
  sellerProcessingTime: number
  /** Days in transit beyond the standard 3. */
  logisticsDelay: number
  deliveryPartnerReference: string
  sourceType: SourceType
}

/* ---------- Suppliers ---------- */

export interface Supplier {
  supplierId: string
  supplierName: string
  suppliedProducts: string[]
  averageLeadTime: number
  lastOrderDate: string
  expectedRestockDate: string | null
  supplierStatus: 'Active' | 'Delayed' | 'On Hold'
  contactPersonDemo: string
  performanceNotes: string
  sourceType: SourceType
}

/* ---------- Reviews ---------- */

export type ReviewIssue = 'None' | 'Product Quality' | 'Sizing' | 'Description Mismatch' | 'Packaging' | 'Delivery' | 'Pricing'

export interface Review {
  reviewId: string
  productId: string
  anonymisedCustomerId: string
  rating: number
  reviewDate: string
  /** Synthetic text written for the demo. */
  reviewText: string
  sentiment: 'Positive' | 'Neutral' | 'Negative'
  issueCategory: ReviewIssue
  sourceType: SourceType
}

/* ---------- Pricing ---------- */

export type PricingPosition =
  | 'Competitive'
  | 'Slightly Expensive'
  | 'Significantly Expensive'
  | 'Below Market Reference'
  | 'Insufficient Data'

export interface PricingRecord {
  productId: string
  currentSellingPrice: number
  costPrice: number
  previousSellingPrice: number
  suggestedPriceRange: { min: number; max: number } | null
  /** Synthetic reference price. Not real competitor data. */
  syntheticMarketReferencePrice: number | null
  pricingPosition: PricingPosition
  /** Ratio 0–1 off MRP. */
  discountPercentage: number
  /** (price − cost) ÷ price, ratio 0–1. Before platform fees, shipping, ads and tax. */
  estimatedGrossMargin: number
  sourceType: SourceType
}
