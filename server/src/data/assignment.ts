/** The aggregate figures given in the assignment brief. Never adjusted to fit synthetic records. */
export const ASSIGNMENT_FACTS = {
  sales: { previous: 200_000, current: 135_000 },
  orders: { previous: 400, current: 270 },
  cancellationRate: { previous: 0.08, current: 0.14 },
  averageSellingPrice: { previous: 500, current: 500 },
  outOfStockProducts: { previous: 5, current: 18 },
} as const
