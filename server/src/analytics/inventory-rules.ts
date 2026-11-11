import type { InventoryStatus } from '../../../shared/records.ts'
import { round, safeDivide } from './math.ts'

/**
 * Stock rules, used both when the dataset is generated and when it is analysed,
 * so a status can never disagree with the numbers behind it.
 */

/** Available stock ÷ average daily sales. Null when there are no recent sales (cover is unknown, not infinite). */
export function estimatedDaysRemaining(availableStock: number, averageDailySales: number): number | null {
  if (averageDailySales <= 0) return null
  const days = safeDivide(availableStock, averageDailySales)
  return days === null ? null : round(days, 1)
}

export interface StockInput {
  availableStock: number
  inTransitStock: number
  reorderLevel: number
  averageDailySales: number
  supplierLeadTimeDays: number
}

export function inventoryStatus(input: StockInput): InventoryStatus {
  const { availableStock, inTransitStock, reorderLevel, averageDailySales, supplierLeadTimeDays } = input
  if (availableStock <= 0) return inTransitStock > 0 ? 'Replenishment Pending' : 'Out of Stock'
  const days = estimatedDaysRemaining(availableStock, averageDailySales)
  if (availableStock <= reorderLevel / 2 || (days !== null && days < supplierLeadTimeDays / 2)) return 'Critical'
  if (availableStock <= reorderLevel || (days !== null && days < supplierLeadTimeDays)) return 'Low Stock'
  return 'Healthy'
}

/** In stock today, but at the current sales rate it runs out before a new order from the supplier could arrive. */
export function runsOutBeforeReplenishment(input: StockInput): boolean {
  if (input.availableStock <= 0 || input.inTransitStock > 0) return false
  const days = estimatedDaysRemaining(input.availableStock, input.averageDailySales)
  return days !== null && days < input.supplierLeadTimeDays
}
