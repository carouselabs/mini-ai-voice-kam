/**
 * Hosted mode (Vercel functions): any request may land on any instance, so conversations, voice calls and the
 * seller's workspace live in shared storage (Upstash Redis over REST). A small fake of that REST API stands in for
 * Redis, and two separate app instances share it, the way two function instances would.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import type { AiStreamEvent, AssistantReply } from '../../shared/ai.ts'

/* ---------- Fake Upstash REST API ---------- */
const data = new Map<string, string>()
const commands: string[] = []
const kvServer = createServer((req, res) => {
  let raw = ''
  req.on('data', (chunk) => (raw += chunk))
  req.on('end', () => {
    res.setHeader('content-type', 'application/json')
    if (req.headers.authorization !== 'Bearer test-token') {
      res.writeHead(401)
      res.end(JSON.stringify({ error: 'WRONGPASS invalid token' }))
      return
    }
    const [cmd, ...args] = JSON.parse(raw) as string[]
    commands.push(cmd)
    let result: unknown = null
    if (cmd === 'GET') result = data.get(args[0]) ?? null
    else if (cmd === 'MGET') result = args.map((k) => data.get(k) ?? null)
    else if (cmd === 'SET') {
      data.set(args[0], args[1])
      result = 'OK'
    } else if (cmd === 'DEL') result = data.delete(args[0]) ? 1 : 0
    res.end(JSON.stringify({ result }))
  })
})
await new Promise<void>((resolve) => kvServer.listen(0, '127.0.0.1', resolve))
after(() => kvServer.close())

const runtime = mkdtempSync(path.join(tmpdir(), 'mini-ai-hosted-test-'))
process.env.MINI_AI_RUNTIME_DIR = runtime
process.env.KV_REST_API_URL = `http://127.0.0.1:${(kvServer.address() as AddressInfo).port}/`
process.env.KV_REST_API_TOKEN = 'test-token'

const { createApp } = await import('../src/app.ts')
const { readAiConfig } = await import('../src/ai/config.ts')
const { createAiService } = await import('../src/ai/service.ts')
const { readRealtimeConfig } = await import('../src/realtime/config.ts')
const { kvFromEnv, upstashKv } = await import('../src/kv.ts')

/** One app instance, like one serverless function instance: its own in-memory stores. */
function instance() {
  const server = createApp({
    ai: createAiService(readAiConfig({ AI_PROVIDER: 'mock' })),
    realtime: { config: readRealtimeConfig({ AI_PROVIDER: 'mock' }) },
  }).listen(0)
  return new Promise<{ base: string; close: () => void }>((resolve) =>
    server.once('listening', () => resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`, close: () => server.close() })),
  )
}

async function stream(url: string, body: unknown): Promise<AiStreamEvent[]> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return (await res.text())
    .split('\n\n')
    .map((block) => block.split('\n').find((l) => l.startsWith('data: ')))
    .filter((l): l is string => Boolean(l))
    .map((l) => JSON.parse(l.slice(6)) as AiStreamEvent)
}
const replyOf = (events: AiStreamEvent[]) => (events.find((e) => e.type === 'reply') as { reply: AssistantReply } | undefined)?.reply
const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('hosted mode: shared storage across instances', () => {
  let a: { base: string; close: () => void }
  let b: { base: string; close: () => void }
  before(async () => {
    a = await instance()
    b = await instance()
  })
  after(() => {
    a.close()
    b.close()
  })

  test('the storage settings come from the host, and a wrong token fails without revealing it', async () => {
    assert.ok(kvFromEnv())
    assert.equal(kvFromEnv({}), null)
    const wrong = upstashKv(process.env.KV_REST_API_URL!.replace(/\/$/, ''), 'not-the-token')
    await assert.rejects(wrong.get('x'), (error: Error) => /Storage GET failed \(401: WRONGPASS/.test(error.message) && !error.message.includes('not-the-token'))
  })

  test('a conversation opened on one instance continues on another', async () => {
    const opened = await stream(`${a.base}/ai/sessions`, {})
    const sessionId = (opened.find((e) => e.type === 'session') as { sessionId: string }).sessionId
    assert.ok(replyOf(opened)?.text.includes('32.5%'))
    assert.ok(data.has(`miniai:chat:${sessionId}`), 'saved to shared storage')

    const turn = await stream(`${b.base}/ai/chat`, { sessionId, message: 'My sales have dropped. What is happening?', clientMessageId: 'h1' })
    const reply = replyOf(turn)
    assert.ok(reply, `instance B answered: ${JSON.stringify(turn[0])}`)
    assert.ok(reply.evidence.some((e) => e.findingId.startsWith('FIND-SD')))

    const transcript = (await (await fetch(`${a.base}/ai/sessions/${sessionId}`)).json()) as { transcript: Array<{ text: string }> }
    assert.ok(transcript.transcript.some((t) => t.text.includes('My sales have dropped')), 'instance A sees the turn B answered')

    await post(`${b.base}/ai/sessions/${sessionId}/end`, {})
    const afterEnd = await stream(`${a.base}/ai/chat`, { sessionId, message: 'hello', clientMessageId: 'h2' })
    assert.equal((afterEnd[0] as { code: string }).code, 'not_found', 'ending on one instance ends it everywhere')
  })

  test('a tracker change made through one instance is seen by the other, and nothing is written to disk', async () => {
    const created = await post(`${b.base}/tracker`, { recommendationId: 'ACT-001' })
    assert.equal(created.status, 201)
    const list = (await (await fetch(`${a.base}/tracker`)).json()) as { data: { actions: Array<{ recommendationId: string; status: string }> } }
    assert.deepEqual(
      list.data.actions.map((x) => [x.recommendationId, x.status]),
      [['ACT-001', 'Awaiting Approval']],
    )
    assert.ok(data.has('miniai:workspace:tracker.json'))
    assert.deepEqual(readdirSync(runtime), [], 'the runtime folder stays empty in hosted mode')
  })

  test('a voice call started on one instance can run its data checks on another', async () => {
    const session = (await (await post(`${a.base}/realtime/session`, { language: 'en' })).json()) as { voiceSessionId: string }
    const call = { voiceSessionId: session.voiceSessionId, callId: 'call_h1', name: 'getSellerOverview', arguments: '{}' }
    const first = (await (await post(`${b.base}/realtime/tool`, call)).json()) as { ok: boolean; duplicate: boolean }
    assert.deepEqual([first.ok, first.duplicate], [true, false])
    const again = (await (await post(`${a.base}/realtime/tool`, call)).json()) as { duplicate: boolean }
    assert.equal(again.duplicate, true, 'the same call never runs twice, whichever instance gets it')
    const record = (await (await fetch(`${a.base}/realtime/session/${session.voiceSessionId}`)).json()) as { toolCalls: Array<{ name: string }> }
    assert.deepEqual(record.toolCalls.map((c) => c.name), ['getSellerOverview'])

    assert.equal((await post(`${b.base}/realtime/session/${session.voiceSessionId}/end`, {})).status, 204)
    assert.equal((await post(`${a.base}/realtime/tool`, { ...call, callId: 'call_h2' })).status, 404, 'an ended call is refused everywhere')
  })
})
