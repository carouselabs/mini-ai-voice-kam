import type { Breakdown, Comparison, RateComparison, Polarity, Tone, Direction } from '../../../shared/analytics.ts'
import { directionOf, percentChange, percentagePointChange, round, safeDivide } from './math.ts'

export function compare(previous: number, current: number): Comparison {
  const change = round(current - previous, 2)
  return { previous, current, change, percentChange: percentChange(previous, current), direction: directionOf(change) }
}

export function compareRates(previous: number, current: number): RateComparison {
  const pointChange = percentagePointChange(previous, current)
  return {
    previous,
    current,
    pointChange,
    relativeChange: safeDivide(current - previous, previous),
    direction: directionOf(pointChange),
  }
}

export function toneFor(direction: Direction, polarity: Polarity): Tone {
  if (direction === 'flat') return 'neutral'
  const improved = direction === 'up' ? polarity === 'higher-is-better' : polarity === 'lower-is-better'
  return improved ? 'positive' : 'negative'
}

/** Counts per key for both periods, sorted by the current count then name. */
export function breakdown<T>(
  previousItems: readonly T[],
  currentItems: readonly T[],
  key: (item: T) => string,
): Breakdown[] {
  const keys = new Set([...previousItems.map(key), ...currentItems.map(key)])
  return [...keys]
    .map((k) => {
      const previous = previousItems.filter((item) => key(item) === k).length
      const current = currentItems.filter((item) => key(item) === k).length
      return { key: k, previous, current, change: current - previous }
    })
    .sort((a, b) => b.current - a.current || b.previous - a.previous || a.key.localeCompare(b.key))
}

export function shares<T>(items: readonly T[], key: (item: T) => string) {
  const total = items.length
  const counts = new Map<string, number>()
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  return [...counts.entries()]
    .map(([k, count]) => ({ key: k, count, share: total ? round(count / total, 4) : 0 }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

/** Monday-start week of an IST date. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const offset = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().slice(0, 10)
}

export function weekLabel(start: string): string {
  return `Week of ${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${start}T00:00:00Z`))}`
}
