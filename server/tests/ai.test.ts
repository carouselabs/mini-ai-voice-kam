/**
 * AI layer tests. They use the scripted MOCK model (never a live LLM) but the real tools,
 * real data, real sessions and the real HTTP/SSE routes.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import type { AiStreamEvent, AssistantReply } from '../../shared/ai.ts'
import { chooseModel, readAiConfig } from '../src/ai/config.ts'
import { MOCK_PREFIX, MockProvider } from '../src/ai/mock-provider.ts'
import type { InputItem, ModelProvider, ModelRequest } from '../src/ai/provider.ts'
import { createAiService, type AiService } from '../src/ai/service.ts'
import { buildTools, executeTool } from '../src/ai/tools.ts'
import { createApp } from '../src/app.ts'
import { getStore } from '../src/data/store.ts'
import { KAM_TOOLS } from '../src/services/kam-data.ts'
import { getWorkspace } from '../src/workspace/index.ts'

// Tracker and memory files go to a throwaway folder (the workspace is created lazily, after this runs).
const runtime = mkdtempSync(path.join(tmpdir(), 'mini-ai-ai-test-'))
process.env.MINI_AI_RUNTIME_DIR = runtime
const resetWorkspace = () => {
  rmSync(runtime, { recursive: true, force: true })
}
after(() => resetWorkspace())

const WORKSPACE_TOOLS = ['getActionTracker', 'getBusinessReview', 'getSellerContext', 'proposeTrackerAction', 'rememberSellerContext']
const TOOL_ARGS: Record<string, string> = {
  searchProducts: '{"query":"earbuds"}',
  getTopProducts: '{"limit":null}',
  proposeTrackerAction: '{"recommendationId":"ACT-003","note":null}',
  rememberSellerContext: '{"kind":"preference","topic":"Language","text":"Seller prefers short answers.","productIds":[]}',
}

/** Records every request so tests can check what the model was given. */
class SpyProvider implements ModelProvider {
  readonly name = 'mock' as const
  inner = new MockProvider()
  requests: ModelRequest[] = []
  resolveModel() {
    return this.inner.resolveModel()
  }
  generate(request: ModelRequest) {
    this.requests.push({ ...request, input: [...request.input] })
    return this.inner.generate(request)
  }
}

function start(ai: AiService) {
  const server = createApp({ ai }).listen(0)
  return new Promise<{ base: string; close: () => void }>((resolve) =>
    server.once('listening', () =>
      resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai`, close: () => server.close() }),
    ),
  )
}

async function stream(url: string, body: unknown): Promise<AiStreamEvent[]> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal(res.headers.get('content-type')?.startsWith('text/event-stream'), true, `${url} → ${res.status}`)
  const text = await res.text()
  return text
    .split('\n\n')
    .map((block) => block.split('\n').find((l) => l.startsWith('data: ')))
    .filter((l): l is string => Boolean(l))
    .map((l) => JSON.parse(l.slice(6)) as AiStreamEvent)
}

const replyOf = (events: AiStreamEvent[]) => (events.find((e) => e.type === 'reply') as { reply: AssistantReply } | undefined)?.reply
const toolLabels = (events: AiStreamEvent[]) =>
  events.filter((e): e is Extract<AiStreamEvent, { type: 'tool' }> => e.type === 'tool' && e.status === 'start').map((e) => e.label)

describe('tool registry', () => {
  const tools = buildTools(getStore())

  test('every Milestone 2 data function is exposed, and nothing else beyond the documented additions', () => {
    const names = tools.map((t) => t.name)
    for (const t of KAM_TOOLS) assert.ok(names.includes(t.name), `${t.name} missing`)
    assert.deepEqual(
      names.filter((n) => !KAM_TOOLS.some((t) => t.name === n)).sort(),
      ['investigateAccountHealth', 'investigatePricing', 'searchProducts', ...WORKSPACE_TOOLS].sort(),
    )
  })

  test('no tool can approve, start, complete, reject or delete anything', () => {
    for (const t of tools) assert.doesNotMatch(t.name, /approve|complete|reject|delete|update|status|start/i, t.name)
  })

  test('schemas are strict and every tool returns compact output', () => {
    for (const t of tools) {
      assert.equal(t.parameters.additionalProperties, false)
      const args = TOOL_ARGS[t.name] ?? (t.parameters.required.includes('productId') ? '{"productId":"PRD-015"}' : '{}')
      const run = executeTool(tools, t.name, args)
      assert.equal(run.ok, true, `${t.name}: ${run.output.slice(0, 120)}`)
      assert.ok(run.output.length <= 18_000, `${t.name} output ${run.output.length}`)
      if (!WORKSPACE_TOOLS.includes(t.name)) assert.ok(JSON.parse(run.output).meta.lastUpdatedAt, `${t.name} keeps freshness`)
    }
    resetWorkspace()
  })

  test('only allowlisted tools with valid arguments run', () => {
    assert.equal(executeTool(tools, 'deleteEverything', '{}').ok, false)
    assert.equal(executeTool(tools, 'getProductPerformance', '{"productId":"PRD-999"}').ok, false)
    assert.equal(executeTool(tools, 'getProductPerformance', '{}').ok, false)
    assert.equal(executeTool(tools, 'getSellerOverview', '{"sql":"drop table"}').ok, false)
    assert.equal(executeTool(tools, 'getSellerOverview', 'not json').ok, false)
    const ok = executeTool(tools, 'getProductPerformance', '{"productId":"PRD-015"}')
    assert.match(ok.output, /Wireless Bluetooth Earbuds/)
  })

  test('investigation tools hand back real findings', () => {
    const run = executeTool(tools, 'investigateSalesDecline', '{}')
    assert.ok(run.findings.some((f) => f.findingId === 'FIND-SD-04'))
  })
})

describe('configuration', () => {
  test('missing key is reported, not faked', () => {
    const config = readAiConfig({ AI_PROVIDER: 'openai' })
    assert.equal(config.apiKey, null)
    assert.match(config.issues[0], /OPENAI_API_KEY/)
  })
  test('limits are clamped', () => {
    assert.equal(readAiConfig({ AI_MAX_TOOL_ROUNDS: '99' }).maxToolRounds, 12)
    assert.equal(readAiConfig({ AI_MAX_TOOL_ROUNDS: 'x' }).maxToolRounds, 8)
  })
  test('auto model choice prefers the newest mini model', () => {
    assert.equal(chooseModel(['gpt-4o-mini', 'gpt-5-mini', 'gpt-5.2-mini', 'gpt-5.2', 'o3']), 'gpt-5.2-mini')
    assert.equal(chooseModel(['gpt-4.1-mini', 'gpt-4o']), 'gpt-4.1-mini')
    assert.equal(chooseModel(['whisper-1']), null)
  })
})

describe('conversation API with the mock model', () => {
  const spy = new SpyProvider()
  const ai = createAiService({ ...readAiConfig({ AI_PROVIDER: 'mock' }), maxToolRounds: 3 })
  ai.provider = spy
  let base = ''
  let close = () => {}
  let sessionId = ''

  before(async () => ({ base, close } = await start(ai)))
  after(() => close())

  test('opening the assistant inspects the account first, then greets instantly from verified figures', async () => {
    spy.requests = []
    const events = await stream(`${base}/sessions`, {})
    sessionId = (events.find((e) => e.type === 'session') as { sessionId: string }).sessionId
    assert.deepEqual(toolLabels(events), ['Reviewing your account overview', 'Checking overall account health'])
    const reply = replyOf(events)!
    assert.equal(spy.requests.length, 0, 'no model call before the seller says anything')
    assert.equal(reply.timing.modelMs, 0)
    assert.equal(reply.mock, true, 'still labelled as the test setup')
    // The brief's first step: greet and find out why the seller is calling, with the real figures in plain words.
    assert.match(reply.text, /^Hi! I’m Mini AI, your account manager\./)
    assert.match(reply.text, /down 32\.5% this month, about ₹65,000/)
    assert.match(reply.text, /prices didn’t change, so it’s fewer orders coming in/)
    assert.match(reply.text, /Is that why you’re calling, or is something else on your mind\?$/)
    assert.doesNotMatch(reply.text, /main|biggest|seller-side|SKU|ASP/i)
    assert.deepEqual(reply.evidence.map((e) => e.findingId), ['FIND-SD-01', 'FIND-SD-02'])
    assert.deepEqual(reply.checks, ['Reviewing your account overview', 'Checking overall account health'])
    assert.equal(events.at(-1)?.type, 'done')
  })

  test('a sales question runs the sales investigation and cites its findings', async () => {
    const events = await stream(`${base}/chat`, { sessionId, message: 'My sales have dropped. What is happening?', clientMessageId: 'm1' })
    assert.deepEqual(toolLabels(events), ['Investigating the sales decline'])
    const reply = replyOf(events)!
    assert.ok(reply.text.startsWith(MOCK_PREFIX), 'answers to questions come from the (test) model')
    assert.ok(reply.evidence.every((e) => e.findingId.startsWith('FIND-SD')))
    assert.match(reply.evidence[0].lastUpdatedAt, /^2026-11-01/)
    assert.ok(reply.checks.includes('Investigating the sales decline'))
  })

  test('the next turn carries the earlier conversation', async () => {
    spy.requests = []
    await stream(`${base}/chat`, { sessionId, message: 'Customers are cancelling unnecessarily.', clientMessageId: 'm2' })
    const input = JSON.stringify(spy.requests[0].input as InputItem[])
    // The opening checks and the greeting are in the model's context even though no model wrote the greeting.
    assert.match(input, /investigateAccountHealth/)
    assert.match(input, /fewer orders coming in/)
    assert.match(input, /asking why they are calling/)
    assert.match(input, /My sales have dropped/)
    assert.match(input, /investigateSalesDecline/)
    assert.match(spy.requests[0].instructions, /Virtual Chief Key Account Manager/)
  })

  test('tool rounds stop at the limit and an answer is still given', async () => {
    const events = await stream(`${base}/chat`, { sessionId, message: '[loop] keep checking', clientMessageId: 'm3' })
    assert.equal(toolLabels(events).length, 3)
    assert.ok(replyOf(events))
  })

  test('unavailable information is said to be unavailable', async () => {
    const events = await stream(`${base}/chat`, { sessionId, message: 'Did my supplier confirm the delivery date today?', clientMessageId: 'm4' })
    assert.deepEqual(toolLabels(events), [])
    assert.match(replyOf(events)!.text, /cannot see supplier confirmations/)
  })

  test('duplicate submissions are ignored', async () => {
    const events = await stream(`${base}/chat`, { sessionId, message: 'again', clientMessageId: 'm4' })
    assert.equal(events[0].type, 'error')
    assert.equal(replyOf(events), undefined)
  })

  test('transcript, invalid requests and ending', async () => {
    const res = await fetch(`${base}/sessions/${sessionId}`)
    const body = (await res.json()) as { transcript: Array<{ role: string; text: string }> }
    assert.equal(body.transcript[0].role, 'assistant')
    assert.ok(body.transcript.some((t: { text: string }) => t.text.includes('My sales have dropped')))

    const bad = await fetch(`${base}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) })
    assert.equal(bad.status, 400)
    const tooLong = await fetch(`${base}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, message: 'x'.repeat(1001) }) })
    assert.equal(tooLong.status, 400)

    await fetch(`${base}/sessions/${sessionId}/end`, { method: 'POST' })
    const afterEnd = await stream(`${base}/chat`, { sessionId, message: 'hello', clientMessageId: 'm5' })
    assert.equal((afterEnd[0] as { code: string }).code, 'not_found')
  })
})

describe('seller workspace through Mini AI', () => {
  const tools = buildTools(getStore())
  const spy = new SpyProvider()
  const ai = createAiService({ ...readAiConfig({ AI_PROVIDER: 'mock' }), maxToolRounds: 3 })
  ai.provider = spy
  let base = ''
  let close = () => {}
  let sessionId = ''

  before(async () => {
    resetWorkspace()
    ;({ base, close } = await start(ai))
    const events = await stream(`${base}/sessions`, {})
    sessionId = (events.find((e) => e.type === 'session') as { sessionId: string }).sessionId
  })
  after(() => {
    close()
    resetWorkspace()
  })

  test('Mini AI can only add an action as awaiting approval, once', () => {
    const first = executeTool(tools, 'proposeTrackerAction', '{"recommendationId":"ACT-002","note":"Seller wants it by Friday"}')
    assert.equal(first.ok, true)
    assert.equal(first.tracker[0].status, 'Awaiting Approval')
    assert.equal(first.tracker[0].createdBy, 'mini-ai')
    assert.equal(first.tracker[0].approvedAt, null)
    const again = executeTool(tools, 'proposeTrackerAction', '{"recommendationId":"ACT-002","note":null}')
    assert.equal(again.ok, false)
    assert.match(again.output, /already in the tracker \(Awaiting Approval\)/)
    assert.equal(executeTool(tools, 'proposeTrackerAction', '{"recommendationId":"ACT-999","note":null}').ok, false)
  })

  test('memory notes are checked and saved as unverified seller statements', () => {
    assert.equal(executeTool(tools, 'rememberSellerContext', '{"kind":"fact","topic":"x","text":"y","productIds":[]}').ok, false)
    assert.equal(executeTool(tools, 'rememberSellerContext', '{"kind":"decision","topic":"x","text":"y","productIds":["PRD-999"]}').ok, false)
    const ok = executeTool(tools, 'rememberSellerContext', '{"kind":"seller_statement","topic":"Speaker price","text":"Seller says the brand raised the speaker price.","productIds":["PRD-016"]}')
    assert.equal(ok.ok, true)
    const saved = getWorkspace().memory.list()[0]
    assert.equal(saved.verifiedBySystem, false)
    assert.equal(saved.source, 'seller')
  })

  test('asking to add an action returns an approval card, not an approved action', async () => {
    const events = await stream(`${base}/chat`, { sessionId, message: 'Please add ACT-005 to my tracker', clientMessageId: 'w1' })
    assert.deepEqual(toolLabels(events), ['Adding it to your tracker for approval'])
    const reply = replyOf(events)!
    assert.equal(reply.tracker.length, 1)
    assert.equal(reply.tracker[0].recommendationId, 'ACT-005')
    assert.equal(reply.tracker[0].status, 'Awaiting Approval')
    assert.match(reply.text, /awaiting your approval/)
    const saved = getWorkspace().tracker.list().find((a) => a.recommendationId === 'ACT-005')
    assert.equal(saved?.status, 'Awaiting Approval')
  })

  test('recommendations come back as action cards with their tracker state, separate from findings', async () => {
    const events = await stream(`${base}/chat`, { sessionId, message: 'What should I do now?', clientMessageId: 'w2' })
    const reply = replyOf(events)!
    assert.ok(reply.actions.length >= 1)
    assert.ok(reply.actions.every((a) => a.actionId.startsWith('ACT-') && a.metricToMonitor && a.state))
    assert.ok(reply.evidence.every((e) => e.findingId.startsWith('FIND-')))
  })

  test('a business review and the tracker can be read', async () => {
    const review = replyOf(await stream(`${base}/chat`, { sessionId, message: 'Give me a business review', clientMessageId: 'w3' }))!
    assert.match(review.text, /top action is/)
    assert.ok(review.actions.length > 0)
    const tracker = replyOf(await stream(`${base}/chat`, { sessionId, message: 'What is in my tracker?', clientMessageId: 'w4' }))!
    assert.match(tracker.text, /You have 2 actions in your tracker, 0 overdue/)
  })

  test('a new session recalls what the seller said and their open actions', async () => {
    const events = await stream(`${base}/sessions`, {})
    assert.deepEqual(toolLabels(events), ['Reviewing your account overview', 'Checking overall account health', 'Recalling what you told me'])
    // The greeting mentions the actions waiting for approval…
    assert.match(replyOf(events)!.text, /2 actions are waiting for your approval in the tracker/)
    // …and the first question goes to the model with what the seller said before.
    const newSession = (events.find((e) => e.type === 'session') as { sessionId: string }).sessionId
    spy.requests = []
    await stream(`${base}/chat`, { sessionId: newSession, message: 'What did I tell you about prices?', clientMessageId: 'w5' })
    const input = JSON.stringify(spy.requests[0].input)
    assert.match(input, /brand raised the speaker price/)
    assert.match(input, /Awaiting Approval/)
  })
})

describe('without an API key', () => {
  const ai = createAiService(readAiConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: '' }))
  let base = ''
  let close = () => {}
  before(async () => ({ base, close } = await start(ai)))
  after(() => close())

  test('health says it is not configured and never exposes a key', async () => {
    const res = await fetch(`${base}/health`)
    const text = await res.text()
    const health = JSON.parse(text)
    assert.equal(health.configured, false)
    assert.equal(health.provider, 'openai')
    assert.match(health.issues.join(' '), /OPENAI_API_KEY/)
    assert.doesNotMatch(text, /sk-|apiKey/)
  })

  test('opening the assistant explains how to configure it instead of pretending', async () => {
    const events = await stream(`${base}/sessions`, {})
    assert.equal((events[0] as { code: string }).code, 'not_configured')
    assert.equal(replyOf(events), undefined)
  })
})
