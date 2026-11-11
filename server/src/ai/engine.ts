import { randomUUID } from 'node:crypto'
import type { ActionCard, AssistantReply, EvidenceCard, ReplyLanguage, TrackerCard } from '../../../shared/ai.ts'
import type { Finding } from '../../../shared/insights.ts'
import type { TrackerAction } from '../../../shared/tracker.ts'
import type { Store } from '../data/store.ts'
import { ACTION_IDS } from '../insights/recommendations.ts'
import { CATEGORY_LINK } from '../insights/review.ts'
import { recommendationsWithFindings } from '../investigations/index.ts'
import { getWorkspace } from '../workspace/index.ts'
import { composeInstructions, SESSION_START_INSTRUCTION } from './prompts.ts'
import type { InputItem, ModelProvider, ModelRequest } from './provider.ts'
import { addTurn, history, remember, type Session } from './sessions.ts'
import { executeTool, toolDefinitions, type ToolSpec } from './tools.ts'
import { hasSellerContext } from './workspace-tools.ts'
import { findClaimProblems, revisionRequest, type ClaimRule } from './claims.ts'
import { GREETING_FINDINGS, openingGreeting } from './greeting.ts'

export const DASHBOARD_LINKS: Record<string, string> = {
  '/': 'Overview',
  '/products': 'Products',
  '/orders': 'Orders',
  '/inventory': 'Inventory',
  '/cancellations': 'Cancellations',
  '/returns': 'Returns & Refunds',
  '/delivery': 'Delivery & Fulfilment',
  '/payments': 'Payments & Settlements',
  '/promotions': 'Promotions',
  '/reviews': 'Ratings & Reviews',
  '/analytics': 'Business Analytics',
  '/review': 'Business Review',
  '/recommendations': 'AI Recommendations',
  '/actions': 'Action Tracker',
  '/settings': 'Settings',
}

export const REPLY_FORMAT: ModelRequest['format'] = {
  type: 'json_schema',
  name: 'kam_reply',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'language', 'findingIds', 'actionIds', 'links'],
    properties: {
      reply: { type: 'string', description: 'What you say to the seller. Spoken aloud: natural sentences, no markdown.' },
      language: { type: 'string', enum: ['en', 'hi', 'hinglish'] },
      findingIds: { type: 'array', items: { type: 'string' }, description: 'IDs of findings from tool results that the reply relies on.' },
      actionIds: {
        type: 'array',
        items: { type: 'string', enum: Object.values(ACTION_IDS) },
        description: 'IDs of recommended actions (ACT-…) the reply suggests, from a tool result. Empty if none.',
      },
      links: { type: 'array', items: { type: 'string', enum: Object.keys(DASHBOARD_LINKS) } },
    },
  },
}

const ACTION_ID_SET = new Set<string>(Object.values(ACTION_IDS))

export interface EngineDeps {
  provider: ModelProvider
  tools: ToolSpec[]
  store: Store
  maxToolRounds: number
}

export interface ToolEvent {
  status: 'start' | 'end'
  callId: string
  label: string
  ok?: boolean
}

export function card(finding: Finding, store: Store): EvidenceCard {
  const path = CATEGORY_LINK[finding.category]
  const { previous, current } = store.manifest.periods
  return {
    findingId: finding.findingId,
    title: finding.title,
    observation: finding.observation,
    impact: finding.impact,
    confidence: finding.confidence,
    dataSource: finding.dataSource,
    evidence: finding.evidence.slice(0, 3).map((e) => ({ label: e.label, value: e.value, source: e.source })),
    products: finding.affectedProducts.slice(0, 4).map((p) => p.productName),
    period: `${previous.shortLabel} → ${current.shortLabel}`,
    lastUpdatedAt: store.manifest.lastUpdatedAt,
    link: path ? { path, label: DASHBOARD_LINKS[path] } : null,
  }
}

/** Recommendation cards, with their live tracker state, for the actions the reply suggests or added. */
function actionCards(store: Store, ids: string[]): ActionCard[] {
  if (!ids.length) return []
  const views = getWorkspace().tracker.views(recommendationsWithFindings(store))
  return ids
    .map((id) => views.find((v) => v.actionId === id))
    .filter((v) => v !== undefined)
    .map((v) => ({
      actionId: v.actionId,
      title: v.title,
      priority: v.priority,
      problem: v.problem,
      caution: v.caution,
      metricToMonitor: v.metricToMonitor,
      owner: v.suggestedOwner,
      suggestedDeadline: v.suggestedDeadline,
      state: v.state,
      trackerActionId: v.trackerActionId,
    }))
}

export const trackerCard = (a: TrackerAction): TrackerCard => ({
  id: a.id,
  recommendationId: a.recommendationId,
  title: a.title,
  status: a.status,
  priority: a.priority,
  owner: a.owner,
  dueDate: a.dueDate,
})

interface ParsedReply {
  reply: string
  language: ReplyLanguage
  findingIds: string[]
  actionIds: string[]
  links: string[]
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x: unknown): x is string => typeof x === 'string') : [])

function parseReply(text: string | null): ParsedReply {
  try {
    const parsed = JSON.parse(text ?? '')
    if (typeof parsed.reply === 'string' && parsed.reply.trim()) {
      return {
        reply: parsed.reply.trim(),
        language: ['en', 'hi', 'hinglish'].includes(parsed.language) ? parsed.language : 'en',
        findingIds: strings(parsed.findingIds),
        actionIds: strings(parsed.actionIds).filter((id) => ACTION_ID_SET.has(id)),
        links: strings(parsed.links),
      }
    }
  } catch {
    // fall through: plain text answer
  }
  const plain = (text ?? '').trim()
  return { reply: plain || 'Sorry, I could not put an answer together. Could you ask again?', language: 'en', findingIds: [], actionIds: [], links: [] }
}

/**
 * One turn: the model may request allowlisted tools for up to maxToolRounds rounds,
 * then must answer. Tool events are reported as they actually run.
 */
export async function runTurn(
  deps: EngineDeps,
  session: Session,
  opening: InputItem[],
  onTool: (event: ToolEvent) => void,
  signal: AbortSignal,
  sellerText: string | null,
  /** Checks already run for this turn (the session-start inspection). */
  initialChecks: string[] = [],
  seller: { via?: 'voice' | 'text'; recognitionMs?: number } = {},
): Promise<AssistantReply> {
  const started = performance.now()
  let modelMs = 0
  let modelRounds = 0
  const toolTimes: Array<{ label: string; ms: number }> = []
  const instructions = composeInstructions(deps.store)
  const tools = toolDefinitions(deps.tools)
  const turnItems: InputItem[] = [...opening]
  const checks: string[] = [...initialChecks]
  const created: TrackerAction[] = []
  let finalText: string | null = null
  let finalItemsStart = 0
  let model = ''

  for (let round = 0; round <= deps.maxToolRounds; round++) {
    const forceAnswer = round === deps.maxToolRounds
    const modelStart = performance.now()
    const result = await deps.provider.generate({
      instructions,
      input: [...history(session), ...turnItems],
      tools,
      toolChoice: forceAnswer ? 'none' : 'auto',
      format: REPLY_FORMAT,
      signal,
    })
    modelMs += performance.now() - modelStart
    modelRounds++
    model = result.model
    finalItemsStart = turnItems.length
    turnItems.push(...result.items)
    if (!result.functionCalls.length || forceAnswer) {
      finalText = result.text
      break
    }
    for (const call of result.functionCalls) {
      const spec = deps.tools.find((t) => t.name === call.name)
      onTool({ status: 'start', callId: call.callId, label: spec?.label ?? 'Running a data check' })
      const toolStart = performance.now()
      const run = executeTool(deps.tools, call.name, call.arguments, deps.store)
      toolTimes.push({ label: run.label, ms: Math.round(performance.now() - toolStart) })
      for (const f of run.findings) session.findings.set(f.findingId, f)
      created.push(...run.tracker)
      if (run.ok && !checks.includes(run.label)) checks.push(run.label)
      onTool({ status: 'end', callId: call.callId, label: run.label, ok: run.ok })
      turnItems.push({ type: 'function_call_output', call_id: call.callId, output: run.output } as InputItem)
    }
  }

  // Check the draft for the overclaims seen in live evaluation. If one is found, the model rewrites the
  // reply once with the exact facts; the seller only ever hears the corrected version.
  const claimCheck = { revised: [] as ClaimRule[], remaining: [] as ClaimRule[] }
  const problems = findClaimProblems(parseReply(finalText).reply, deps.store)
  if (problems.length) {
    const draftItems = turnItems.splice(finalItemsStart)
    const modelStart = performance.now()
    const result = await deps.provider.generate({
      instructions,
      input: [...history(session), ...turnItems, ...draftItems, { role: 'developer', content: revisionRequest(problems) } as InputItem],
      tools,
      toolChoice: 'none',
      format: REPLY_FORMAT,
      signal,
    })
    modelMs += performance.now() - modelStart
    modelRounds++
    if (result.text && parseReply(result.text).reply.trim()) {
      finalText = result.text
      turnItems.push(...result.items)
      claimCheck.revised = [...new Set(problems.map((p) => p.rule))]
      claimCheck.remaining = [...new Set(findClaimProblems(parseReply(finalText).reply, deps.store).map((p) => p.rule))]
    } else {
      turnItems.push(...draftItems)
      claimCheck.remaining = [...new Set(problems.map((p) => p.rule))]
    }
  }

  const parsed = parseReply(finalText)
  const evidence = parsed.findingIds
    .map((id) => session.findings.get(id))
    .filter((f): f is Finding => Boolean(f))
    .slice(0, 3)
    .map((f) => card(f, deps.store))
  // Entries added this turn are shown as approval cards, so their recommendations are not repeated as cards.
  const addedRecs = new Set(created.map((a) => a.recommendationId))
  const actions = actionCards(deps.store, [...new Set(parsed.actionIds)].filter((id) => !addedRecs.has(id)).slice(0, 3))
  const links = [...new Set(parsed.links)].filter((p) => p in DASHBOARD_LINKS).slice(0, 3).map((path) => ({ path, label: DASHBOARD_LINKS[path] }))

  addTurn(session, turnItems)
  const now = new Date().toISOString()
  const timing = {
    totalMs: Math.round(performance.now() - started),
    modelMs: Math.round(modelMs),
    toolMs: toolTimes.reduce((s, t) => s + t.ms, 0),
    modelRounds,
    tools: toolTimes,
  }
  if (sellerText) remember(session, { role: 'seller', text: sellerText, at: now, via: seller.via ?? 'text', ...(seller.recognitionMs !== undefined ? { recognitionMs: seller.recognitionMs } : {}) })
  remember(session, { role: 'assistant', text: parsed.reply, at: now, timing })
  session.lastActiveAt = Date.now()

  return {
    id: randomUUID(),
    text: parsed.reply,
    language: parsed.language,
    evidence,
    actions,
    tracker: created.map(trackerCard),
    links,
    checks,
    model,
    mock: deps.provider.name === 'mock',
    timing,
    ...(claimCheck.revised.length || claimCheck.remaining.length ? { claimCheck } : {}),
  }
}

/** Opening items for a new session: the server inspects the account first, then asks for a greeting. */
export function sessionOpening(
  deps: EngineDeps,
  session: Session,
  onTool: (event: ToolEvent) => void,
): { items: InputItem[]; checks: string[]; toolTimes: Array<{ label: string; ms: number }> } {
  const checks: string[] = []
  const toolTimes: Array<{ label: string; ms: number }> = []
  const items: InputItem[] = [
    { role: 'developer', content: '[Session start] Before the seller says anything, inspect their account.' } as InputItem,
  ]
  // What the seller said before, their rejections and open actions, so nothing is asked twice.
  const start = hasSellerContext(deps.store) ? ['getSellerOverview', 'investigateAccountHealth', 'getSellerContext'] : ['getSellerOverview', 'investigateAccountHealth']
  for (const name of start) {
    const callId = `start_${name}_${session.id.slice(0, 8)}`
    const spec = deps.tools.find((t) => t.name === name)!
    onTool({ status: 'start', callId, label: spec.label })
    const started = performance.now()
    const run = executeTool(deps.tools, name, '{}', deps.store)
    toolTimes.push({ label: run.label, ms: Math.round(performance.now() - started) })
    for (const f of run.findings) session.findings.set(f.findingId, f)
    onTool({ status: 'end', callId, label: run.label, ok: run.ok })
    if (run.ok) checks.push(run.label)
    items.push({ type: 'function_call', call_id: callId, name, arguments: '{}' } as InputItem)
    items.push({ type: 'function_call_output', call_id: callId, output: run.output } as InputItem)
  }
  items.push({ role: 'developer', content: SESSION_START_INSTRUCTION } as InputItem)
  return { items, checks, toolTimes }
}

/**
 * Opens a conversation without waiting for the model: the same account checks as before, then a greeting built from
 * the verified figures (see greeting.ts). The model sees the checks and the greeting as the first turn, so the
 * seller's first question is answered with the whole account already in context.
 */
export function openSession(deps: EngineDeps, session: Session, onTool: (event: ToolEvent) => void): AssistantReply {
  const started = performance.now()
  const opening = sessionOpening(deps, session, onTool)
  const text = openingGreeting(deps.store)
  const findings = GREETING_FINDINGS.map((id) => session.findings.get(id)).filter((f): f is Finding => Boolean(f))
  // Replace the "write a greeting" instruction with what was actually said.
  opening.items.pop()
  opening.items.push(
    {
      role: 'developer',
      content:
        '[Session start] You inspected the account (results above) and greeted the seller with the next message, asking why they are calling. Do not greet again. From their answer, lead the call: understand, check, explain simply, ask about what only they know, recommend two or three actions, and recap at the end.',
    } as InputItem,
    { role: 'assistant', content: JSON.stringify({ reply: text, language: 'en', findingIds: findings.map((f) => f.findingId), actionIds: [], links: [] }) } as InputItem,
  )
  addTurn(session, opening.items)
  const at = new Date().toISOString()
  const toolMs = opening.toolTimes.reduce((s, t) => s + t.ms, 0)
  const timing = { totalMs: Math.round(performance.now() - started), modelMs: 0, toolMs, modelRounds: 0, tools: opening.toolTimes }
  remember(session, { role: 'assistant', text, at, timing })
  session.lastActiveAt = Date.now()
  return {
    id: randomUUID(),
    text,
    language: 'en',
    evidence: findings.map((f) => card(f, deps.store)),
    actions: [],
    tracker: [],
    links: [],
    checks: opening.checks,
    model: 'greeting from verified data (no model call)',
    mock: deps.provider.name === 'mock',
    timing,
  }
}
