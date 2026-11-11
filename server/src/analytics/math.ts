/** Small numeric helpers used by every analytics module. Pure, no data access. */

/** a ÷ b, or null when b is zero (never NaN or Infinity). */
export function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator === 0 || !Number.isFinite(denominator)) return null
  return numerator / denominator
}

/** a ÷ b, or 0 when b is zero. Use only where "no base" genuinely means zero. */
export function ratioOrZero(numerator: number, denominator: number): number {
  return safeDivide(numerator, denominator) ?? 0
}

/** Relative change (current − previous) ÷ previous; null without a base. */
export function percentChange(previous: number, current: number): number | null {
  return safeDivide(current - previous, previous)
}

/** Change between two ratios, in percentage points (0.08 → 0.14 = 6). */
export function percentagePointChange(previousRatio: number, currentRatio: number): number {
  return round((currentRatio - previousRatio) * 100, 6)
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function sum<T>(items: readonly T[], pick: (item: T) => number): number {
  let total = 0
  for (const item of items) total += pick(item)
  return total
}

export function countBy<T, K extends string>(items: readonly T[], key: (item: T) => K): Record<K, number> {
  const counts = {} as Record<K, number>
  for (const item of items) {
    const k = key(item)
    counts[k] = (counts[k] ?? 0) + 1
  }
  return counts
}

export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = groups.get(k)
    if (list) list.push(item)
    else groups.set(k, [item])
  }
  return groups
}

export type Direction = 'up' | 'down' | 'flat'

export function directionOf(delta: number | null): Direction {
  if (delta === null || Math.abs(delta) < 1e-9) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

/** Whole days between two ISO timestamps (b − a), fractional. */
export function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86_400_000
}

export function hoursBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 3_600_000
}

/** IST calendar date (YYYY-MM-DD) of an ISO timestamp. */
export function istDate(iso: string): string {
  return new Date(Date.parse(iso) + 5.5 * 3_600_000).toISOString().slice(0, 10)
}
