/**
 * Live voice routes (OpenAI Realtime). OpenAI's client-secret endpoint is replaced by a fake, so these tests
 * check exactly what Mini AI sends and returns. Live API behaviour is tested by npm run voice:eval.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'

process.env.MINI_AI_RUNTIME_DIR = mkdtempSync(path.join(tmpdir(), 'mini-ai-realtime-test-'))
const { createApp } = await import('../src/app.ts')
const { readAiConfig } = await import('../src/ai/config.ts')
const { createAiService } = await import('../src/ai/service.ts')
const { readRealtimeConfig } = await import('../src/realtime/config.ts')
const { REALTIME_TOOL_NAMES, VOICE_TOOL_OUTPUT_CHARS } = await import('../src/realtime/tools.ts')
const { getWorkspace } = await import('../src/workspace/index.ts')
const { MAX_ACTIVE_PER_CLIENT } = await import('../src/realtime/sessions.ts')
const { SESSIONS_PER_10_MIN } = await import('../src/routes/realtime.ts')

const PERMANENT_KEY = 'sk-test-PERMANENT-key-never-in-a-response'
// oxlint-disable-next-line typescript/no-explicit-any
type Json = any

async function start(options: { mintFails?: boolean; env?: Record<string, string> } = {}) {
  const minted: Array<{ body: Json; safetyId: string }> = []
  const app = createApp({
    ai: createAiService(readAiConfig({ AI_PROVIDER: 'mock' })),
    realtime: {
      config: readRealtimeConfig({ OPENAI_API_KEY: PERMANENT_KEY, ...options.env }),
      mint: async (body, safetyId) => {
        minted.push({ body: body as Json, safetyId })
        if (options.mintFails) throw new Error(`OpenAI client_secrets 401: bad key ${PERMANENT_KEY}`)
        return { value: `ek_test_${minted.length}`, expires_at: Math.floor(Date.now() / 1000) + 120 }
      },
    },
  })
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/realtime`
  const call = async (method: string, url: string, body?: unknown) => {
    const res = await fetch(`${base}${url}`, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await res.text()
    return { status: res.status, text, body: text ? JSON.parse(text) : null, headers: res.headers }
  }
  return { call, minted, close: () => server.close() }
}

describe('live voice session', () => {
  let t: Awaited<ReturnType<typeof start>>
  before(async () => (t = await start()))
  after(() => t.close())

  test('health says live voice is available, with the model and voice', async () => {
    const { body } = await t.call('GET', '/health')
    assert.deepEqual(body, { available: true, provider: 'openai', model: 'gpt-realtime-2.1', voice: 'marin', reason: null })
  })

  test('a session returns a short-lived secret and never the permanent key', async () => {
    const res = await t.call('POST', '/session', { language: 'auto' })
    assert.equal(res.status, 200)
    assert.equal(res.body.clientSecret, 'ek_test_1')
    assert.equal(res.body.mock, false)
    assert.match(res.body.voiceSessionId, /^voice_/)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.doesNotMatch(res.text, /sk-test|PERMANENT/)
  })

  test('the session sent to OpenAI: model, voice, semantic turn detection, transcription, curated tools', () => {
    const { body, safetyId } = t.minted[0]
    assert.deepEqual(body.expires_after, { anchor: 'created_at', seconds: 120 })
    const s = body.session
    assert.equal(s.type, 'realtime')
    assert.equal(s.model, 'gpt-realtime-2.1')
    assert.equal(s.audio.output.voice, 'marin')
    assert.deepEqual(s.audio.input.turn_detection, { type: 'semantic_vad', eagerness: 'high', create_response: true, interrupt_response: true })
    assert.equal(s.audio.input.transcription.model, 'gpt-transcribe')
    assert.equal(s.audio.input.transcription.language, undefined, 'auto mode leaves the language open')
    assert.deepEqual(s.tools.map((x: Json) => x.name).sort(), [...REALTIME_TOOL_NAMES].sort())
    assert.ok(!s.tools.some((x: Json) => x.name === 'getSalesAnalysis'), 'raw data dumps are not exposed to voice')
    assert.equal(s.reasoning.effort, 'low')
    assert.match(safetyId, /^[0-9a-f]{32}$/, 'a hashed identifier, not the IP')
  })

  test('the voice instructions keep the KAM brain, drop the JSON format, and carry verified figures', () => {
    const instructions: string = t.minted[0].body.session.instructions
    assert.match(instructions, /Virtual Chief Key Account Manager/)
    assert.match(instructions, /Naming cancellation figures/)
    assert.doesNotMatch(instructions, /Structured reply|findingIds/)
    assert.match(instructions, /Live voice call/)
    assert.match(instructions, /Language: automatic/)
    assert.match(instructions, /Overall cancellation rate \(all initiators\) 8% → 14%/)
    assert.match(instructions, /18 of 43 SKUs; 10 of 20 products/)
    assert.match(instructions, /likely contributor to the decline, not a proven cause/)
    // The condensed brain keeps the accuracy rules from the chat's modules.
    assert.match(instructions, /Never call stockouts, or any medium-confidence cause, the main, biggest or clearest driver/)
    assert.match(instructions, /say to check quality first/)
    assert.match(instructions, /waiting for their approval/)
    assert.match(instructions, /memory tool/)
    // Small enough to set up the call and start each answer quickly (the full chat modules made it ~22,000).
    assert.ok(instructions.length < 12_000, `voice instructions are ${instructions.length} characters`)
  })

  test('Hindi mode fixes the language and the recognition hint', async () => {
    await t.call('POST', '/session', { language: 'hi' })
    const s = t.minted.at(-1)!.body.session
    assert.match(s.instructions, /Language: Hindi/)
    assert.equal(s.audio.input.transcription.language, 'hi')
  })

  test('bad requests are rejected', async () => {
    assert.equal((await t.call('POST', '/session', { language: 'french' })).status, 400)
    assert.equal((await t.call('POST', '/session', { language: 'en', replaces: 42 })).status, 400)
  })
})

describe('tool relay', () => {
  let t: Awaited<ReturnType<typeof start>>
  let id = ''
  before(async () => {
    t = await start()
    id = (await t.call('POST', '/session', { language: 'en' })).body.voiceSessionId
  })
  after(() => t.close())

  test('runs an existing data tool and returns a compact output plus evidence cards', async () => {
    const res = await t.call('POST', '/tool', { voiceSessionId: id, callId: 'call_1', name: 'investigateSalesDecline', arguments: '{}' })
    assert.equal(res.body.ok, true)
    assert.ok(res.body.output.length <= VOICE_TOOL_OUTPUT_CHARS, `output ${res.body.output.length}`)
    assert.ok(res.body.evidence.length > 0 && res.body.evidence[0].findingId.startsWith('FIND-SD'))
    assert.equal(res.body.duplicate, false)
  })

  test('the same call_id never runs twice', async () => {
    const first = await t.call('POST', '/tool', { voiceSessionId: id, callId: 'call_add', name: 'proposeTrackerAction', arguments: '{"recommendationId":"ACT-003","note":null}' })
    const again = await t.call('POST', '/tool', { voiceSessionId: id, callId: 'call_add', name: 'proposeTrackerAction', arguments: '{"recommendationId":"ACT-003","note":null}' })
    assert.equal(first.body.tracker[0].status, 'Awaiting Approval')
    assert.equal(again.body.duplicate, true)
    assert.equal(getWorkspace().tracker.list().filter((a) => a.recommendationId === 'ACT-003').length, 1)
  })

  test('voice can only propose: the entry awaits the seller’s approval', () => {
    const entry = getWorkspace().tracker.list().find((a) => a.recommendationId === 'ACT-003')!
    assert.equal(entry.status, 'Awaiting Approval')
    assert.equal(entry.createdBy, 'mini-ai')
    assert.equal(entry.approvedAt, null)
  })

  test('tools outside the voice list, and bad arguments, do not run', async () => {
    const hidden = await t.call('POST', '/tool', { voiceSessionId: id, callId: 'call_x', name: 'getSalesAnalysis', arguments: '{}' })
    assert.equal(hidden.body.ok, false)
    const bad = await t.call('POST', '/tool', { voiceSessionId: id, callId: 'call_y', name: 'getProductPerformance', arguments: '{"productId":"PRD-999"}' })
    assert.equal(bad.body.ok, false)
    assert.equal((await t.call('POST', '/tool', { voiceSessionId: id, callId: 'c', name: 'x' })).status, 400)
    assert.equal((await t.call('POST', '/tool', { voiceSessionId: 'voice_nope', callId: 'c', name: 'getSellerOverview', arguments: '{}' })).status, 404)
  })

  test('a language change returns a session.update with new rules and recognition hint', async () => {
    const res = await t.call('POST', '/language', { voiceSessionId: id, language: 'hinglish' })
    assert.match(res.body.session.instructions, /Language: Hinglish/)
    assert.equal(res.body.session.audio.input.transcription.model, 'gpt-transcribe')
    assert.equal(res.body.session.audio.input.transcription.language, undefined)
  })

  test('the call keeps an audit of tools and the reported transcript; after ending, tools stop', async () => {
    assert.equal((await t.call('POST', '/transcript', { voiceSessionId: id, role: 'seller', text: 'Why did sales fall?' })).status, 204)
    assert.equal((await t.call('POST', '/transcript', { voiceSessionId: id, role: 'assistant', text: 'Sales fell 32.5%.', timing: { firstAudioMs: 900, junk: 'x' } })).status, 204)
    assert.equal((await t.call('POST', '/transcript', { voiceSessionId: id, role: 'robot', text: 'x' })).status, 400)
    const record = (await t.call('GET', `/session/${id}`)).body
    assert.deepEqual(record.transcript.map((x: Json) => x.role), ['seller', 'assistant'])
    assert.deepEqual(record.transcript[1].timing, { firstAudioMs: 900 })
    assert.ok(record.toolCalls.some((c: Json) => c.name === 'investigateSalesDecline' && c.ok))
    assert.equal((await t.call('POST', `/session/${id}/end`, {})).status, 204)
    assert.equal((await t.call('POST', '/tool', { voiceSessionId: id, callId: 'late', name: 'getSellerOverview', arguments: '{}' })).status, 404)
  })

  test('a tab replacing its own call ends the old one; others sharing the address keep theirs', async () => {
    const a = (await t.call('POST', '/session', { language: 'en' })).body.voiceSessionId
    const other = (await t.call('POST', '/session', { language: 'en' })).body.voiceSessionId
    const b = (await t.call('POST', '/session', { language: 'en', replaces: a })).body.voiceSessionId
    assert.equal((await t.call('POST', '/tool', { voiceSessionId: a, callId: 'q', name: 'getSellerOverview', arguments: '{}' })).status, 404)
    assert.equal((await t.call('POST', '/tool', { voiceSessionId: b, callId: 'q', name: 'getSellerOverview', arguments: '{}' })).body.ok, true)
    assert.equal((await t.call('POST', '/tool', { voiceSessionId: other, callId: 'q', name: 'getSellerOverview', arguments: '{}' })).body.ok, true)
  })

  test('over the per-address abuse limit, the oldest live call ends', async () => {
    const ids: string[] = []
    for (let i = 0; i < MAX_ACTIVE_PER_CLIENT + 1; i++) ids.push((await t.call('POST', '/session', { language: 'en' })).body.voiceSessionId)
    assert.equal((await t.call('POST', '/tool', { voiceSessionId: ids[0], callId: 'q', name: 'getSellerOverview', arguments: '{}' })).status, 404)
    assert.equal((await t.call('POST', '/tool', { voiceSessionId: ids.at(-1), callId: 'q', name: 'getSellerOverview', arguments: '{}' })).body.ok, true)
  })
})

describe('failure and test modes', () => {
  test('if OpenAI refuses, the answer is safe and says to use the chat', async () => {
    const t = await start({ mintFails: true })
    const res = await t.call('POST', '/session', { language: 'en' })
    assert.equal(res.status, 502)
    assert.match(res.body.error.message, /use the chat/)
    assert.doesNotMatch(res.text, /sk-test|PERMANENT|401/)
    t.close()
  })

  test('without a key, live voice is unavailable and says why', async () => {
    const app = createApp({ ai: createAiService(readAiConfig({ AI_PROVIDER: 'mock' })), realtime: { config: readRealtimeConfig({}) } })
    const server = app.listen(0)
    await new Promise((r) => server.once('listening', r))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/realtime`
    const health = (await (await fetch(`${base}/health`)).json()) as Json
    assert.equal(health.available, false)
    assert.match(health.reason, /OPENAI_API_KEY/)
    assert.equal((await fetch(`${base}/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400)
    server.close()
  })

  test('sessions are rate limited per person', async () => {
    const t = await start()
    const statuses: number[] = []
    for (let i = 0; i <= SESSIONS_PER_10_MIN; i++) statuses.push((await t.call('POST', '/session', { language: 'en' })).status)
    assert.deepEqual(statuses.slice(0, SESSIONS_PER_10_MIN), Array(SESSIONS_PER_10_MIN).fill(200))
    assert.equal(statuses[SESSIONS_PER_10_MIN], 429)
    t.close()
  })

  test('the turn detector and voice can be configured', () => {
    assert.deepEqual(readRealtimeConfig({ OPENAI_REALTIME_TURN_DETECTION: 'server:600' }).turnDetection, { type: 'server_vad', silence_duration_ms: 600 })
    assert.equal(readRealtimeConfig({ OPENAI_REALTIME_VOICE: 'robot' }).issues.length > 0, true)
  })
})

describe('language of a seller turn (Auto mode)', async () => {
  const { detectSpokenLanguage } = await import('../../shared/realtime.ts')
  test('Hindi, Hinglish and English are told apart', () => {
    assert.equal(detectSpokenLanguage('मेरी बिक्री इस महीने क्यों कम हो गई है?'), 'hi')
    assert.equal(detectSpokenLanguage('मेरे सेल्स क्यों गिर रहे हैं? थोड़ा डिटेल में बताओ।'), 'hi')
    assert.equal(detectSpokenLanguage('Mere sales kyun gir rahe hain? Thoda detail mein batao.'), 'hinglish')
    assert.equal(detectSpokenLanguage('Ab Hindi mein samjhao, cancellation ka issue kya hai?'), 'hinglish')
    assert.equal(detectSpokenLanguage('What about cancellations? Explain in English.'), 'en')
  })
  test('a filler word or a name never switches the language', () => {
    assert.equal(detectSpokenLanguage('okay'), null)
    assert.equal(detectSpokenLanguage('haan theek'), null)
    assert.equal(detectSpokenLanguage('Tell me about the Wireless Bluetooth Earbuds'), 'en')
  })
})
