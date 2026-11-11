/**
 * Shrinks tool results before they go to the model: drops day-by-day series, caps long lists,
 * shortens long text and rounds decimals, tightening step by step until the result fits.
 * IDs, dates, sources, freshness and confidence are kept. The output is always valid JSON.
 */

const DROP_KEYS = new Set(['dailyTrend', 'weeklyTrend', 'stockoutHistory', 'variants'])

const LIST_LIMITS: Record<string, number> = {
  findings: 14,
  evidence: 4,
  recordIds: 6,
  affectedProducts: 6,
  possibleCauses: 4,
  supportingEvidence: 5,
  checkedAreas: 10,
  records: 10,
  rows: 20,
}

export const MAX_TOOL_OUTPUT_CHARS = 18_000

interface Level {
  /** Limit for lists without their own limit. */
  list: number
  /** Multiplier for the per-key limits above. */
  scale: number
  /** Longest string kept, in characters. */
  text: number
}

const LEVELS: Level[] = [
  { list: 15, scale: 1, text: 2000 },
  { list: 8, scale: 0.6, text: 600 },
  { list: 5, scale: 0.4, text: 300 },
  { list: 3, scale: 0.25, text: 180 },
]

function prune(value: unknown, key: string, level: Level): unknown {
  if (typeof value === 'number') return Number.isInteger(value) ? value : Math.round(value * 10_000) / 10_000
  if (typeof value === 'string') return value.length > level.text ? `${value.slice(0, level.text)}…` : value
  if (Array.isArray(value)) {
    const own = LIST_LIMITS[key]
    const limit = Math.max(1, own ? Math.round(own * level.scale) : level.list)
    const kept = value.slice(0, limit).map((item) => prune(item, '', level))
    return value.length > limit ? [...kept, `(${value.length - limit} more not shown)`] : kept
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (DROP_KEYS.has(k) || v === undefined) continue
      out[k] = prune(v, k, level)
    }
    return out
  }
  return value
}

export function compactForModel(result: unknown, maxChars = MAX_TOOL_OUTPUT_CHARS): string {
  let json = ''
  for (const level of LEVELS) {
    json = JSON.stringify(prune(result, '', level))
    if (json.length <= maxChars) return json
  }
  // Still too large: keep only the top-level metadata and say so, rather than cutting JSON mid-string.
  const meta = (result as { meta?: unknown } | null)?.meta
  return JSON.stringify({ error: 'This result was too large to send in full. Use a more specific tool.', meta })
}
