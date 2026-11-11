/**
 * Synthetic catalogue design for the demo seller. Every number here is invented for the demo
 * (sourceType synthetic_demo) except the totals the generator is forced to hit, which come
 * from the assignment brief.
 */
import type { ProductCategory, Supplier } from '../../shared/records.ts'

export interface VariantSpec {
  code: string
  label: string
  weight: number
  /** YYYY-MM-DD when stock reached zero. Before 1 Oct means it was already out at the end of September. */
  stockoutDate?: string
  /** Stock on hand at data refresh (ignored when out of stock). */
  available?: number
  inTransit?: number
  expectedRestock?: string
  lastRestocked: string
  damaged?: number
}

export interface ProductSpec {
  id: string
  sku: string
  name: string
  category: ProductCategory
  subcategory: string
  description: string
  price: number
  previousPrice?: number
  cost: number
  mrp: number
  attribute: 'Size' | 'Colour' | 'Standard'
  variants: VariantSpec[]
  supplierId: string
  listingCreatedAt: string
  rating: number
  reviewCount: number
  /** Planned orders per month. The solver may move flexible products a little to hit the assignment totals. */
  target: { previous: number; current: number }
  flex?: boolean
  impressions: { previous: number; current: number }
  /** Orders ÷ product views. */
  conversion: { previous: number; current: number }
  /** Product views when there are no orders to derive them from. */
  fixedCurrentViews?: number
  /** Share of current-period orders that wait 2–4 days before dispatch. */
  slowDispatchShare?: number
  referencePrice: number | null
}

export const PRODUCTS: ProductSpec[] = [
  {
    id: 'PRD-001', sku: 'UCF-TSH-001', name: 'Men’s Cotton Crew Neck T-Shirt (Pack of 2)',
    category: 'Fashion', subcategory: 'Men’s T-Shirts',
    description: '100% combed cotton, regular fit. Pack of two crew neck T-shirts.',
    price: 399, cost: 205, mrp: 799, attribute: 'Size',
    variants: [
      { code: 'S', label: 'S', weight: 0.2, available: 4, lastRestocked: '2026-09-04' },
      { code: 'M', label: 'M', weight: 0.35, stockoutDate: '2026-10-09', lastRestocked: '2026-09-04' },
      { code: 'L', label: 'L', weight: 0.3, stockoutDate: '2026-10-12', lastRestocked: '2026-09-04' },
      { code: 'XL', label: 'XL', weight: 0.15, available: 9, lastRestocked: '2026-09-04' },
    ],
    supplierId: 'SUP-01', listingCreatedAt: '2024-02-10', rating: 4.3, reviewCount: 1284,
    target: { previous: 64, current: 30 },
    impressions: { previous: 41000, current: 29500 }, conversion: { previous: 0.045, current: 0.032 },
    referencePrice: 429,
  },
  {
    id: 'PRD-002', sku: 'UCF-KUR-002', name: 'Women’s Printed Rayon Straight Kurta',
    category: 'Fashion', subcategory: 'Women’s Kurtas',
    description: 'Straight-cut printed rayon kurta. True to size; the model wears size M.',
    price: 599, cost: 300, mrp: 1199, attribute: 'Size',
    variants: [
      { code: 'S', label: 'S', weight: 0.2, stockoutDate: '2026-10-20', lastRestocked: '2026-09-10' },
      { code: 'M', label: 'M', weight: 0.35, available: 22, lastRestocked: '2026-10-02' },
      { code: 'L', label: 'L', weight: 0.3, available: 18, lastRestocked: '2026-10-02' },
      { code: 'XL', label: 'XL', weight: 0.15, stockoutDate: '2026-09-18', lastRestocked: '2026-08-21' },
    ],
    supplierId: 'SUP-02', listingCreatedAt: '2024-06-18', rating: 3.8, reviewCount: 642,
    target: { previous: 36, current: 28 }, flex: true,
    impressions: { previous: 22000, current: 19500 }, conversion: { previous: 0.032, current: 0.027 },
    slowDispatchShare: 0.3, referencePrice: 579,
  },
  {
    id: 'PRD-003', sku: 'UCF-CHN-003', name: 'Men’s Slim Fit Stretch Chinos',
    category: 'Fashion', subcategory: 'Men’s Trousers',
    description: 'Slim fit cotton-stretch chinos with a mid rise. Waist sizes 30 to 36.',
    price: 799, cost: 470, mrp: 1499, attribute: 'Size',
    variants: [
      { code: '30', label: '30', weight: 0.25, stockoutDate: '2026-10-22', lastRestocked: '2026-09-12' },
      { code: '32', label: '32', weight: 0.35, available: 14, lastRestocked: '2026-09-12' },
      { code: '34', label: '34', weight: 0.25, available: 11, lastRestocked: '2026-09-12' },
      { code: '36', label: '36', weight: 0.15, stockoutDate: '2026-09-21', lastRestocked: '2026-08-14' },
    ],
    supplierId: 'SUP-07', listingCreatedAt: '2024-09-03', rating: 4.0, reviewCount: 318,
    target: { previous: 18, current: 12 }, flex: true,
    impressions: { previous: 30000, current: 38000 }, conversion: { previous: 0.012, current: 0.006 },
    referencePrice: 699,
  },
  {
    id: 'PRD-004', sku: 'UCF-PLZ-004', name: 'Women’s Solid Palazzo Pants',
    category: 'Fashion', subcategory: 'Women’s Bottoms',
    description: 'Flowing viscose palazzo pants with an elasticated waist.',
    price: 349, cost: 165, mrp: 699, attribute: 'Size',
    variants: [
      { code: 'S', label: 'S', weight: 0.25, available: 18, lastRestocked: '2026-10-05' },
      { code: 'M', label: 'M', weight: 0.35, available: 6, lastRestocked: '2026-10-05' },
      { code: 'L', label: 'L', weight: 0.25, available: 20, lastRestocked: '2026-10-05' },
      { code: 'XL', label: 'XL', weight: 0.15, stockoutDate: '2026-09-15', lastRestocked: '2026-08-11' },
    ],
    supplierId: 'SUP-02', listingCreatedAt: '2023-11-22', rating: 4.4, reviewCount: 905,
    target: { previous: 32, current: 28 }, flex: true,
    impressions: { previous: 19000, current: 18500 }, conversion: { previous: 0.04, current: 0.04 },
    referencePrice: 359,
  },
  {
    id: 'PRD-005', sku: 'UCF-HOD-005', name: 'Unisex Fleece Hooded Sweatshirt',
    category: 'Fashion', subcategory: 'Winterwear',
    description: 'Brushed fleece hoodie with a kangaroo pocket. Unisex regular fit.',
    price: 699, cost: 380, mrp: 1399, attribute: 'Size',
    variants: [
      { code: 'S', label: 'S', weight: 0.2, stockoutDate: '2026-10-05', inTransit: 30, expectedRestock: '2026-11-08', lastRestocked: '2026-08-28' },
      { code: 'M', label: 'M', weight: 0.35, stockoutDate: '2026-10-04', inTransit: 50, expectedRestock: '2026-11-08', lastRestocked: '2026-08-28' },
      { code: 'L', label: 'L', weight: 0.3, stockoutDate: '2026-10-06', inTransit: 45, expectedRestock: '2026-11-08', lastRestocked: '2026-08-28' },
      { code: 'XL', label: 'XL', weight: 0.15, stockoutDate: '2026-10-08', inTransit: 25, expectedRestock: '2026-11-08', lastRestocked: '2026-08-28' },
    ],
    supplierId: 'SUP-01', listingCreatedAt: '2024-10-01', rating: 4.2, reviewCount: 377,
    target: { previous: 24, current: 6 },
    impressions: { previous: 15000, current: 5200 }, conversion: { previous: 0.035, current: 0.02 },
    referencePrice: 749,
  },
  {
    id: 'PRD-006', sku: 'UCF-SHO-006', name: 'Men’s Lightweight Running Shoes',
    category: 'Fashion', subcategory: 'Footwear',
    description: 'Breathable mesh running shoes with a cushioned sole. UK sizes 7 to 10.',
    price: 999, cost: 560, mrp: 1999, attribute: 'Size',
    variants: [
      { code: '7', label: 'UK 7', weight: 0.2, available: 5, lastRestocked: '2026-09-08' },
      { code: '8', label: 'UK 8', weight: 0.35, stockoutDate: '2026-10-18', lastRestocked: '2026-09-08' },
      { code: '9', label: 'UK 9', weight: 0.3, stockoutDate: '2026-10-21', lastRestocked: '2026-09-08' },
      { code: '10', label: 'UK 10', weight: 0.15, stockoutDate: '2026-09-24', lastRestocked: '2026-08-19' },
    ],
    supplierId: 'SUP-03', listingCreatedAt: '2024-04-15', rating: 3.9, reviewCount: 214,
    target: { previous: 12, current: 9 },
    impressions: { previous: 9000, current: 7600 }, conversion: { previous: 0.025, current: 0.018 },
    slowDispatchShare: 1, referencePrice: 949,
  },
  {
    id: 'PRD-007', sku: 'UCF-SNK-007', name: 'Women’s Canvas Sneakers',
    category: 'Fashion', subcategory: 'Footwear',
    description: 'Classic low-top canvas sneakers with a cushioned insole. UK sizes 4 to 7.',
    price: 549, cost: 270, mrp: 999, attribute: 'Size',
    variants: [
      { code: '4', label: 'UK 4', weight: 0.2, available: 12, lastRestocked: '2026-09-20' },
      { code: '5', label: 'UK 5', weight: 0.3, available: 15, lastRestocked: '2026-09-20' },
      { code: '6', label: 'UK 6', weight: 0.3, available: 14, lastRestocked: '2026-09-20' },
      { code: '7', label: 'UK 7', weight: 0.2, available: 9, lastRestocked: '2026-09-20' },
    ],
    supplierId: 'SUP-03', listingCreatedAt: '2025-03-08', rating: 4.5, reviewCount: 96,
    target: { previous: 8, current: 8 },
    impressions: { previous: 2600, current: 2900 }, conversion: { previous: 0.05, current: 0.062 },
    referencePrice: 599,
  },
  {
    id: 'PRD-008', sku: 'UCF-BED-008', name: 'Cotton Double Bedsheet with 2 Pillow Covers',
    category: 'Lifestyle', subcategory: 'Bed Linen',
    description: '144 TC cotton double bedsheet. Colour: Ocean Blue or Beige, exactly as shown in the photos.',
    price: 499, cost: 250, mrp: 1099, attribute: 'Colour',
    variants: [
      { code: 'BLU', label: 'Ocean Blue', weight: 0.55, stockoutDate: '2026-10-24', lastRestocked: '2026-09-15' },
      { code: 'BEI', label: 'Beige', weight: 0.45, available: 26, lastRestocked: '2026-09-15' },
    ],
    supplierId: 'SUP-02', listingCreatedAt: '2024-01-29', rating: 3.9, reviewCount: 533,
    target: { previous: 22, current: 17 }, flex: true,
    impressions: { previous: 14000, current: 12500 }, conversion: { previous: 0.033, current: 0.03 },
    slowDispatchShare: 0.3, referencePrice: 519,
  },
  {
    id: 'PRD-009', sku: 'UCF-MUG-009', name: 'Ceramic Coffee Mug Set (4 pcs)',
    category: 'Lifestyle', subcategory: 'Kitchen & Dining',
    description: 'Set of four 350 ml glazed ceramic mugs. Microwave safe.',
    price: 289, cost: 125, mrp: 599, attribute: 'Standard',
    variants: [{ code: 'STD', label: 'Standard', weight: 1, available: 48, lastRestocked: '2026-10-10' }],
    supplierId: 'SUP-04', listingCreatedAt: '2023-12-05', rating: 4.3, reviewCount: 702,
    target: { previous: 22, current: 18 }, flex: true,
    impressions: { previous: 12500, current: 12000 }, conversion: { previous: 0.04, current: 0.038 },
    referencePrice: 299,
  },
  {
    id: 'PRD-010', sku: 'UCF-LMP-010', name: 'Adjustable LED Desk Lamp',
    category: 'Lifestyle', subcategory: 'Home Decor',
    description: 'LED desk lamp with three brightness levels and an adjustable arm.',
    price: 599, cost: 300, mrp: 1099, attribute: 'Standard',
    variants: [{ code: 'STD', label: 'Standard', weight: 1, available: 15, lastRestocked: '2026-09-25' }],
    supplierId: 'SUP-04', listingCreatedAt: '2024-07-30', rating: 4.0, reviewCount: 188,
    target: { previous: 10, current: 9 }, flex: true,
    impressions: { previous: 7000, current: 6800 }, conversion: { previous: 0.03, current: 0.03 },
    slowDispatchShare: 0.5, referencePrice: 579,
  },
  {
    id: 'PRD-011', sku: 'UCF-BTL-011', name: 'Stainless Steel Water Bottle 1 L',
    category: 'Lifestyle', subcategory: 'Kitchen & Dining',
    description: 'Leak-proof single-wall stainless steel bottle, 1 litre.',
    price: 299, cost: 125, mrp: 549, attribute: 'Standard',
    variants: [{ code: 'STD', label: 'Standard', weight: 1, available: 3, lastRestocked: '2026-09-18' }],
    supplierId: 'SUP-04', listingCreatedAt: '2023-10-12', rating: 4.5, reviewCount: 1532,
    target: { previous: 36, current: 26 }, flex: true,
    impressions: { previous: 17500, current: 16000 }, conversion: { previous: 0.05, current: 0.048 },
    referencePrice: 319,
  },
  {
    id: 'PRD-012', sku: 'UCF-CDL-012', name: 'Scented Soy Candle Gift Set (3 pcs)',
    category: 'Lifestyle', subcategory: 'Home Decor',
    description: 'Three hand-poured soy wax candles: lavender, vanilla and sandalwood.',
    price: 325, cost: 135, mrp: 649, attribute: 'Standard',
    variants: [{ code: 'STD', label: 'Standard', weight: 1, available: 30, lastRestocked: '2026-10-01' }],
    supplierId: 'SUP-04', listingCreatedAt: '2025-08-20', rating: 4.7, reviewCount: 64,
    target: { previous: 6, current: 9 }, flex: true,
    impressions: { previous: 2100, current: 2400 }, conversion: { previous: 0.055, current: 0.068 },
    referencePrice: 399,
  },
  {
    id: 'PRD-013', sku: 'UCF-TWL-013', name: 'Cotton Bath Towel Set (2 pcs)',
    category: 'Lifestyle', subcategory: 'Bath',
    description: 'Two 500 GSM cotton bath towels, 70 × 140 cm.',
    price: 449, cost: 220, mrp: 899, attribute: 'Standard',
    variants: [{ code: 'STD', label: 'Standard', weight: 1, available: 25, lastRestocked: '2026-09-28' }],
    supplierId: 'SUP-02', listingCreatedAt: '2024-03-14', rating: 4.2, reviewCount: 410,
    target: { previous: 10, current: 8 }, flex: true,
    impressions: { previous: 6000, current: 5800 }, conversion: { previous: 0.035, current: 0.035 },
    referencePrice: 469,
  },
  {
    id: 'PRD-014', sku: 'UCF-YGM-014', name: 'Anti-Slip Yoga Mat 6 mm',
    category: 'Lifestyle', subcategory: 'Fitness',
    description: '6 mm TPE yoga mat with an anti-slip texture and a carry strap.',
    price: 549, cost: 285, mrp: 999, attribute: 'Standard',
    variants: [
      { code: 'STD', label: 'Standard', weight: 1, stockoutDate: '2026-10-14', inTransit: 30, expectedRestock: '2026-11-12', lastRestocked: '2026-08-30' },
    ],
    supplierId: 'SUP-06', listingCreatedAt: '2024-11-11', rating: 4.4, reviewCount: 256,
    target: { previous: 12, current: 5 },
    impressions: { previous: 7800, current: 4100 }, conversion: { previous: 0.035, current: 0.022 },
    referencePrice: 529,
  },
  {
    id: 'PRD-015', sku: 'UCF-EAR-015', name: 'Wireless Bluetooth Earbuds',
    category: 'Electronics', subcategory: 'Audio',
    description: 'True wireless earbuds with up to 24 hours of playback with the charging case.',
    price: 899, cost: 520, mrp: 2499, attribute: 'Colour',
    variants: [
      { code: 'BLK', label: 'Black', weight: 0.65, stockoutDate: '2026-10-16', lastRestocked: '2026-09-06' },
      { code: 'WHT', label: 'White', weight: 0.35, available: 14, lastRestocked: '2026-09-06' },
    ],
    supplierId: 'SUP-05', listingCreatedAt: '2024-05-21', rating: 3.4, reviewCount: 861,
    target: { previous: 16, current: 12 },
    impressions: { previous: 14500, current: 12000 }, conversion: { previous: 0.03, current: 0.016 },
    referencePrice: 799,
  },
  {
    id: 'PRD-016', sku: 'UCF-SPK-016', name: 'Portable Bluetooth Speaker 10 W',
    category: 'Electronics', subcategory: 'Audio',
    description: '10 W portable speaker, IPX5 splash resistant, 8 hours of playback.',
    price: 1399, previousPrice: 1199, cost: 760, mrp: 2499, attribute: 'Standard',
    variants: [{ code: 'STD', label: 'Standard', weight: 1, available: 20, lastRestocked: '2026-09-01' }],
    supplierId: 'SUP-05', listingCreatedAt: '2025-01-17', rating: 4.1, reviewCount: 143,
    target: { previous: 8, current: 3 },
    impressions: { previous: 9500, current: 31000 }, conversion: { previous: 0.015, current: 0.0016 },
    referencePrice: 1149,
  },
  {
    id: 'PRD-017', sku: 'UCF-FIT-017', name: 'Smart Fitness Band with Heart-Rate Monitor',
    category: 'Electronics', subcategory: 'Wearables',
    description: 'Fitness band with heart-rate, sleep and step tracking. Up to 10 days of battery.',
    price: 1199, cost: 1060, mrp: 3999, attribute: 'Standard',
    variants: [{ code: 'STD', label: 'Standard', weight: 1, available: 25, lastRestocked: '2026-10-08' }],
    supplierId: 'SUP-05', listingCreatedAt: '2025-05-02', rating: 4.2, reviewCount: 512,
    target: { previous: 6, current: 10 }, flex: true,
    impressions: { previous: 6200, current: 7600 }, conversion: { previous: 0.03, current: 0.034 },
    referencePrice: 1249,
  },
  {
    id: 'PRD-018', sku: 'UCF-CHG-018', name: '20 W USB-C Fast Charger',
    category: 'Electronics', subcategory: 'Mobile Accessories',
    description: '20 W USB-C power delivery wall charger. BIS certified.',
    price: 299, cost: 140, mrp: 699, attribute: 'Standard',
    variants: [{ code: 'STD', label: 'Standard', weight: 1, available: 10, lastRestocked: '2026-09-14' }],
    supplierId: 'SUP-05', listingCreatedAt: '2024-08-08', rating: 4.3, reviewCount: 980,
    target: { previous: 24, current: 20 }, flex: true,
    impressions: { previous: 13000, current: 12200 }, conversion: { previous: 0.045, current: 0.044 },
    referencePrice: 279,
  },
  {
    id: 'PRD-019', sku: 'UCF-CBL-019', name: 'Braided USB-C Cable 1.5 m',
    category: 'Electronics', subcategory: 'Mobile Accessories',
    description: 'Nylon-braided USB-C to USB-C cable, 1.5 m, 60 W.',
    price: 185, cost: 70, mrp: 399, attribute: 'Standard',
    variants: [{ code: 'STD', label: 'Standard', weight: 1, available: 60, lastRestocked: '2026-10-12' }],
    supplierId: 'SUP-05', listingCreatedAt: '2024-08-08', rating: 4.4, reviewCount: 1120,
    target: { previous: 26, current: 12 }, flex: true,
    impressions: { previous: 11500, current: 9800 }, conversion: { previous: 0.05, current: 0.048 },
    referencePrice: null,
  },
  {
    id: 'PRD-020', sku: 'UCF-MOU-020', name: 'Wired RGB Gaming Mouse',
    category: 'Electronics', subcategory: 'Computer Accessories',
    description: 'Wired gaming mouse with adjustable DPI up to 7200 and RGB lighting.',
    price: 449, cost: 230, mrp: 899, attribute: 'Standard',
    variants: [{ code: 'STD', label: 'Standard', weight: 1, stockoutDate: '2026-09-26', lastRestocked: '2026-08-12' }],
    supplierId: 'SUP-05', listingCreatedAt: '2025-02-26', rating: 4.0, reviewCount: 231,
    target: { previous: 8, current: 0 },
    impressions: { previous: 4800, current: 1300 }, conversion: { previous: 0.035, current: 0 },
    fixedCurrentViews: 90,
    referencePrice: 429,
  },
]

export const SUPPLIERS: Omit<Supplier, 'suppliedProducts' | 'sourceType'>[] = [
  {
    supplierId: 'SUP-01', supplierName: 'Kaveri Knit Works (Demo)', averageLeadTime: 9,
    lastOrderDate: '2026-10-03', expectedRestockDate: '2026-11-08', supplierStatus: 'Delayed',
    contactPersonDemo: 'R. Iyer (demo contact)',
    performanceNotes: 'Hoodie restock ordered 3 Oct was promised for 25 Oct; now expected 8 Nov. No purchase order raised yet for T-shirt sizes M and L.',
  },
  {
    supplierId: 'SUP-02', supplierName: 'Sanganer Prints & Textiles (Demo)', averageLeadTime: 7,
    lastOrderDate: '2026-09-28', expectedRestockDate: null, supplierStatus: 'Active',
    contactPersonDemo: 'M. Sharma (demo contact)', performanceNotes: 'Reliable lead times. Colour batches vary between dye lots.',
  },
  {
    supplierId: 'SUP-03', supplierName: 'Stride Footwear Co. (Demo)', averageLeadTime: 12,
    lastOrderDate: '2026-09-08', expectedRestockDate: null, supplierStatus: 'Active',
    contactPersonDemo: 'A. Khan (demo contact)', performanceNotes: 'Minimum order of 40 pairs per size.',
  },
  {
    supplierId: 'SUP-04', supplierName: 'Moradabad Homecraft (Demo)', averageLeadTime: 10,
    lastOrderDate: '2026-10-10', expectedRestockDate: null, supplierStatus: 'Active',
    contactPersonDemo: 'S. Gupta (demo contact)', performanceNotes: 'Ships in bulk cartons; individual item packaging is basic.',
  },
  {
    supplierId: 'SUP-05', supplierName: 'Nexa Gadgets Distribution (Demo)', averageLeadTime: 21,
    lastOrderDate: '2026-10-08', expectedRestockDate: null, supplierStatus: 'Active',
    contactPersonDemo: 'V. Mehta (demo contact)', performanceNotes: 'Imported stock; lead time of three weeks. Earbud batch received 6 Sep.',
  },
  {
    supplierId: 'SUP-06', supplierName: 'Asana Fitness Supplies (Demo)', averageLeadTime: 8,
    lastOrderDate: '2026-10-15', expectedRestockDate: '2026-11-12', supplierStatus: 'Delayed',
    contactPersonDemo: 'P. Negi (demo contact)', performanceNotes: 'Yoga mat restock ordered 15 Oct; delivery moved from 26 Oct to 12 Nov.',
  },
  {
    supplierId: 'SUP-07', supplierName: 'Urban Weave Garments (Demo)', averageLeadTime: 10,
    lastOrderDate: '2026-09-12', expectedRestockDate: null, supplierStatus: 'Active',
    contactPersonDemo: 'H. Singh (demo contact)', performanceNotes: 'Waist sizes 30 and 36 are produced in small runs.',
  },
]
