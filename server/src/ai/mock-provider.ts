/**
 * Scripted stand-in model for automated tests (AI_PROVIDER=mock). It asks for real tools and
 * builds its reply from their real output, but every reply is prefixed "[Test model]" so it can
 * never be mistaken for a live LLM.
 */
import type { FunctionCall, InputItem, ModelProvider, ModelRequest, ModelResult } from './provider.ts'

export const MOCK_MODEL = 'mock-kam-test-model'
export const MOCK_PREFIX = '[Test model]'

type Item = { type?: string; role?: string; content?: unknown; output?: string; call_id?: string; name?: string }

function textOf(item: Item): string {
  if (typeof item.content === 'string') return item.content
  if (Array.isArray(item.content)) return item.content.map((c: { text?: string }) => c.text ?? '').join(' ')
  return ''
}

/** Tools the scripted model asks for, by what the seller said. */
function plan(message: string): string[] {
  const m = message.toLowerCase()
  if (m.includes('[loop]')) return ['getSellerOverview']
  if (/add .*tracker|track (it|this)|go ahead/.test(m)) return ['proposeTrackerAction']
  if (/remember|note that|please note/.test(m)) return ['rememberSellerContext']
  if (/tracker|committed|pending action/.test(m)) return ['getActionTracker']
  if (/business review|weekly review|overall/.test(m)) return ['getBusinessReview']
  if (/supplier.*(confirm|today)|(confirm|today).*supplier/.test(m)) return []
  if (/cancel/.test(m)) return ['investigateCancellationSpike', 'getCustomerBehaviourPatterns']
  if (/return/.test(m)) return ['investigateReturnSpike', 'getCustomerBehaviourPatterns']
  if (/stock|inventory|restock/.test(m)) return ['investigateInventoryRisk']
  if (/earbud|product/.test(m)) return ['searchProducts']
  if (/what should i do|recommend|do now/.test(m)) return ['getRecommendedActions']
  if (/sale|bikri|revenue|drop/.test(m)) return ['investigateSalesDecline']
  return ['getSellerOverview']
}

function mockArguments(name: string, message: string): Record<string, unknown> {
  if (name === 'searchProducts') return { query: /earbud/i.test(message) ? 'earbuds' : '' }
  if (name === 'proposeTrackerAction') return { recommendationId: message.match(/ACT-\d{3}/)?.[0] ?? 'ACT-001', note: null }
  if (name === 'rememberSellerContext') {
    const said = message.replace(/^(please )?(remember|note) (that )?/i, '')
    return { kind: 'seller_statement', topic: said.slice(0, 40), text: `Seller says: ${said.slice(0, 200)}`, productIds: [] }
  }
  return {}
}

export class MockProvider implements ModelProvider {
  readonly name = 'mock' as const
  private calls = 0
  /** Optional pause per model call (AI_MOCK_DELAY_MS) so screenshots can catch the "investigating" state. */
  private delayMs = Math.min(10_000, Math.max(0, Number(process.env.AI_MOCK_DELAY_MS ?? 0) || 0))

  resolveModel() {
    return Promise.resolve(MOCK_MODEL)
  }

  async generate(request: ModelRequest): Promise<ModelResult> {
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    const items = request.input as Item[]
    // The current turn starts at the last seller (user) or developer message.
    let start = items.length - 1
    while (start > 0 && !(items[start].role === 'user' || items[start].role === 'developer')) start--
    const turn = items.slice(start)
    const message = textOf(turn[0] ?? {})
    const outputs = turn.filter((i) => i.type === 'function_call_output')
    const looping = message.includes('[loop]')

    if (request.toolChoice === 'auto' && (looping || outputs.length === 0)) {
      const names = message.includes('[Session start]') ? [] : plan(message)
      if (names.length) {
        const functionCalls: FunctionCall[] = names.map((name) => ({
          callId: `mock_call_${++this.calls}`,
          name,
          arguments: JSON.stringify(mockArguments(name, message)),
        }))
        return {
          items: functionCalls.map((c) => ({ type: 'function_call', call_id: c.callId, name: c.name, arguments: c.arguments })) as InputItem[],
          text: null,
          functionCalls,
          model: MOCK_MODEL,
        }
      }
    }

    // Final answer from the real tool output of this turn. Only the greeting uses the account check run before it.
    const greeting = message.includes('[Session start]')
    const source = outputs.length ? outputs : greeting ? (items.filter((i) => i.type === 'function_call_output') as Item[]) : []
    let headline = 'I could not find that in the data. Could you tell me more?'
    const findingIds: string[] = []
    const actionIds: string[] = []
    for (const out of source) {
      try {
        const parsed = JSON.parse(out.output ?? '{}')
        const data = parsed.data
        if (parsed.proposed?.title) headline = `I added "${parsed.proposed.title}" to your tracker. It is awaiting your approval.`
        if (typeof parsed.error === 'string' && /already in the tracker/.test(parsed.error)) headline = parsed.error
        if (parsed.saved?.text) headline = `Noted: ${parsed.saved.text}`
        if (data?.summary && Array.isArray(data?.actions)) headline = `You have ${data.summary.total} actions in your tracker, ${data.summary.overdue} overdue.`
        if (Array.isArray(data?.actionPlan) && data.actionPlan[0]) {
          headline = `Your business review: the top action is ${data.actionPlan[0].title}.`
          actionIds.push(...data.actionPlan.map((a: { actionId: string }) => a.actionId))
        }
        if (Array.isArray(data) && typeof data[0]?.actionId === 'string') {
          actionIds.push(...data.slice(0, 2).map((a: { actionId: string }) => a.actionId))
          headline = `Start with: ${data[0].title}.`
        }
        if (data?.headline && headline.startsWith('I could not')) headline = data.headline
        for (const f of data?.findings ?? []) if (typeof f?.findingId === 'string' && findingIds.length < 2) findingIds.push(f.findingId)
        if (Array.isArray(data) && data[0]?.productName && headline.startsWith('I could not')) headline = `I found ${data[0].productName}.`
        if (data?.kpis && headline.startsWith('I could not')) headline = `Sales were ${data.kpis[0].current} rupees this month.`
      } catch {
        // ignore unparsable output
      }
    }
    if (!source.length && /supplier/.test(message.toLowerCase())) headline = 'I cannot see supplier confirmations in the data.'
    const reply = { reply: `${MOCK_PREFIX} ${headline}`, language: 'en', findingIds, actionIds: actionIds.slice(0, 3), links: [] }
    return {
      items: [{ role: 'assistant', content: JSON.stringify(reply) } as InputItem],
      text: JSON.stringify(reply),
      functionCalls: [],
      model: MOCK_MODEL,
    }
  }
}
