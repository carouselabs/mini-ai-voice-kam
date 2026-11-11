/**
 * The tools the live voice agent may call: a curated subset of the existing Mini AI tools, run through the same
 * allowlist, argument validation and compaction as the text assistant (executeTool). No second data engine.
 */
import type { RealtimeToolResponse } from '../../../shared/realtime.ts'
import { compactForModel } from '../ai/compact.ts'
import { card, trackerCard } from '../ai/engine.ts'
import { executeTool, type ToolSpec } from '../ai/tools.ts'
import type { Store } from '../data/store.ts'

/** Account, investigations, products, recommendations and the seller's workspace. Excludes raw per-month dumps. */
export const REALTIME_TOOL_NAMES = [
  'getSellerOverview',
  'investigateAccountHealth',
  'investigateSalesDecline',
  'investigateCancellationSpike',
  'investigateInventoryRisk',
  'investigateReturnSpike',
  'investigatePricing',
  'investigateProductVisibility',
  'searchProducts',
  'getProductPerformance',
  'getInventoryRisks',
  'getDeliveryAnalysis',
  'getCustomerBehaviourPatterns',
  'getRecommendedActions',
  'getBusinessReview',
  'getActionTracker',
  'getSellerContext',
  'proposeTrackerAction',
  'rememberSellerContext',
] as const

export function realtimeTools(all: ToolSpec[]): ToolSpec[] {
  return all.filter((t) => (REALTIME_TOOL_NAMES as readonly string[]).includes(t.name))
}

/** Realtime function-tool definitions: { type, name, description, parameters }. */
export function realtimeToolDefinitions(tools: ToolSpec[]) {
  return tools.map((t) => ({ type: 'function' as const, name: t.name, description: t.description, parameters: t.parameters }))
}

/**
 * Voice answers are a few sentences, so the model gets a tighter summary of each result than in chat (about 6,000
 * characters instead of 18,000): faster to the first spoken word and cheaper, since every later turn re-reads it.
 * The full findings still go to the screen as evidence cards.
 */
export const VOICE_TOOL_OUTPUT_CHARS = 6000

/** Runs one call and shapes the result for both the model (output) and the screen (evidence and tracker cards). */
export function runRealtimeTool(tools: ToolSpec[], store: Store, name: string, args: string): Omit<RealtimeToolResponse, 'duplicate'> {
  const started = performance.now()
  const run = executeTool(tools, name, args, store)
  let output = run.output
  try {
    output = compactForModel(JSON.parse(run.output), VOICE_TOOL_OUTPUT_CHARS)
  } catch {
    // already compact (an error message)
  }
  return {
    ok: run.ok,
    output,
    evidence: run.findings.slice(0, 3).map((f) => card(f, store)),
    tracker: run.tracker.map(trackerCard),
    label: run.label,
    ms: Math.round(performance.now() - started),
  }
}
