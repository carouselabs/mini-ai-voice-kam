import { CircleX, IndianRupee, PackageX, Receipt, ShoppingCart, Undo2, type LucideIcon } from 'lucide-react'
import type { MetricKey } from '@/types'

export const METRIC_ICONS: Record<MetricKey, LucideIcon> = {
  sales: IndianRupee,
  orders: ShoppingCart,
  averageOrderValue: Receipt,
  cancellationRate: CircleX,
  returnRate: Undo2,
  outOfStockProducts: PackageX,
}
