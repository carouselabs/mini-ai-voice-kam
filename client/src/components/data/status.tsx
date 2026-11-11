import { Badge, type BadgeTone } from '@/components/ui/Badge'

/** Status colour always comes with its text label, never colour alone. */
const TONES: Record<string, BadgeTone> = {
  // Orders
  Delivered: 'positive',
  Shipped: 'brand',
  New: 'neutral',
  Confirmed: 'neutral',
  Processing: 'neutral',
  'Ready to Ship': 'neutral',
  Cancelled: 'negative',
  'Return Requested': 'warning',
  Returned: 'warning',
  // Inventory
  Healthy: 'positive',
  'Low Stock': 'warning',
  Critical: 'negative',
  'Out of Stock': 'negative',
  'Replenishment Pending': 'brand',
  // Product performance
  'Top performer': 'positive',
  Declining: 'negative',
  'Needs attention': 'warning',
  'Out of stock': 'negative',
  'At risk': 'warning',
  // Refunds and inspection
  Completed: 'positive',
  Initiated: 'brand',
  Pending: 'neutral',
  Passed: 'positive',
  Failed: 'negative',
  // Pricing position (synthetic reference)
  'Significantly Expensive': 'negative',
  'Slightly Expensive': 'warning',
  Competitive: 'positive',
  'Below Market Reference': 'brand',
  'Insufficient Data': 'outline',
  // Priority
  high: 'warning',
  medium: 'brand',
  low: 'neutral',
  critical: 'negative',
  High: 'warning',
  Medium: 'brand',
  Low: 'neutral',
  'Awaiting Approval': 'warning',
  Approved: 'brand',
  'In Progress': 'brand',
  Blocked: 'negative',
  Rejected: 'neutral',
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status] ?? 'outline'}>{status}</Badge>
}
