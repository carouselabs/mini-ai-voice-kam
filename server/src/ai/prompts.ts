import { readFileSync } from 'node:fs'
import { formatDate } from '../../../shared/format.ts'
import type { Store } from '../data/store.ts'
import { freshness } from '../analytics/overview.ts'

const PROMPT_DIR = new URL('../../prompts/', import.meta.url)
const MODULES = ['kam-master-identity.md', 'kam-business-intelligence.md', 'kam-voice-conversation.md'] as const

let cachedModules: string[] | null = null

/** The three prompt modules, read once from server/prompts. */
export function promptModules(): string[] {
  cachedModules ??= MODULES.map((file) => readFileSync(new URL(file, PROMPT_DIR), 'utf8').trim())
  return cachedModules
}

/** Facts about this account the model should know before using any tool. */
export function accountContext(store: Store, now: Date): string {
  const { seller, manifest } = store
  const { previous, current } = manifest.periods
  return [
    '# This conversation',
    `- Seller: ${seller.sellerName} (${seller.sellerId}), ${seller.businessCategory.join(', ')}, ${seller.businessLocation}. Marketplace: ${seller.marketplace}. Mode: ${seller.dataMode} (demonstration data).`,
    `- "This month" means ${current.label} (${current.start} to ${current.end}); "last month" means ${previous.label}.`,
    `- Data last updated ${formatDate(manifest.lastUpdatedAt)} (${freshness(store, now.getTime()) === 'current' ? 'current' : 'stale'}). Today is ${formatDate(now.toISOString())}.`,
    '- Headline sales, orders, cancellation rate, average selling price and out-of-stock counts come from the assignment brief; every individual record is synthetic demo data.',
  ].join('\n')
}

/** Full instructions: identity, reasoning, conversation, then live account context. */
export function composeInstructions(store: Store, now = new Date()): string {
  return [...promptModules(), accountContext(store, now)].join('\n\n---\n\n')
}

/** Hidden instruction that starts a session with a proactive, data-based greeting. */
export const SESSION_START_INSTRUCTION =
  '[Session start] The seller has just opened the assistant. You have already inspected their account overview and the combined investigation (tool results above). Greet them warmly in English, in at most 3 short sentences: mention the one or two most important things you found, using real figures, then offer to walk them through it. Do not list every metric. State causes only as strongly as the findings allow (stockouts are a likely contributor, not the main driver), and if you mention cancellations, call the headline figure the overall cancellation rate, never seller-side. If you were also given what the seller told you before or their open tracker actions, use them quietly; mention an overdue action in one short clause only if there is one.'
