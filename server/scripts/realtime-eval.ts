/**
 * Live voice evaluation against the real OpenAI Realtime API (no microphone, no mock).
 *
 *   npm run voice:eval                   all scenarios
 *   npm run voice:eval -- --only=en,hi   some scenarios
 *
 * For each scenario it gets a short-lived client secret from Mini AI's own /api/realtime/session (so the exact
 * production session configuration is used), connects over WebSocket, and speaks each seller line as real audio
 * generated with OpenAI text-to-speech (Indian-accented prompt). Server VAD decides when the seller stopped, the
 * model calls tools, the tools run through Mini AI's /api/realtime/tool relay, and the spoken answer's transcript,
 * timings and token usage are recorded. Writes server/eval-results/realtime-*.md. Never prints the API key.
 *
 * This is a LIVE API test with synthetic speech. It is not a microphone test (see npm run voice:live for that).
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import OpenAI from 'openai'
import { detectSpokenLanguage } from '../../shared/realtime.ts'

const envFile = new URL('../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)
process.env.MINI_AI_RUNTIME_DIR = mkdtempSync(path.join(tmpdir(), 'mini-ai-voice-eval-'))
// --turn=semantic:high | semantic:auto | server:700  (compare end-of-turn detectors)
const turnArg = process.argv.find((a) => a.startsWith('--turn='))?.slice(7)
if (turnArg) process.env.OPENAI_REALTIME_TURN_DETECTION = turnArg
if (!process.env.OPENAI_API_KEY) {
  console.error('Set OPENAI_API_KEY in server/.env first.')
  process.exit(1)
}

const { createApp } = await import('../src/app.ts')
const server = createApp().listen(0)
await new Promise((r) => server.once('listening', r))
const BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
const openai = new OpenAI()

type Ev = { type: string; [k: string]: unknown }
interface Turn {
  say: string
  /** Speak this while the previous answer is still playing (barge-in test). */
  interruptAfterMs?: number
}
interface Scenario {
  id: string
  title: string
  language: 'auto' | 'en' | 'hi' | 'hinglish'
  turns: Turn[]
  checks: Array<{ name: string; test: (r: TurnResult[]) => boolean }>
}
interface TurnResult {
  said: string
  heard: string
  reply: string
  tools: string[]
  status: string
  firstAudioMs: number | null
  /** From the turn detector deciding the seller finished (speech_stopped) to the first audio. */
  vadToAudioMs?: number | null
  responseMs: number | null
  toolMs: number
  interruptStopMs?: number | null
}

/* ---------- Speech: 24 kHz 16-bit mono PCM, the Realtime input format ---------- */

const ttsCache = new Map<string, Buffer>()
async function speech(text: string): Promise<Buffer> {
  const cached = ttsCache.get(text)
  if (cached) return cached
  const res = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'coral',
    input: text,
    response_format: 'pcm',
    instructions: 'Speak like an Indian online seller talking to their account manager on a phone call: natural pace, Indian accent.',
  })
  const pcm = Buffer.from(await res.arrayBuffer())
  ttsCache.set(text, pcm)
  return pcm
}
/** A pause as a microphone hears it: faint room noise (about −50 dBFS), never perfect digital zeros. */
const silence = (ms: number) => {
  const samples = Math.round((24000 * ms) / 1000)
  const buf = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round((Math.random() - 0.5) * 200), i * 2)
  return buf
}

/* ---------- One live call ---------- */

class Call {
  ws!: WebSocket
  voiceSessionId = ''
  private listeners: Array<(e: Ev) => void> = []
  usage = { inputAudio: 0, inputText: 0, cached: 0, outputAudio: 0, outputText: 0 }

  /** Auto mode, as the app does it: each seller turn's language updates the session's language rule. */
  private spoken: string | null = null
  languageSwitches: string[] = []

  async open(language: Scenario['language']) {
    const res = await fetch(`${BASE}/realtime/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language }) })
    const s = (await res.json()) as { voiceSessionId: string; clientSecret: string; model: string; error?: { message: string } }
    if (!res.ok) throw new Error(`session: ${s.error?.message}`)
    this.voiceSessionId = s.voiceSessionId
    if (language === 'auto') {
      this.on((e) => {
        if (e.type !== 'conversation.item.input_audio_transcription.completed') return
        const detected = detectSpokenLanguage(String(e.transcript ?? ''))
        if (!detected || detected === this.spoken) return
        this.spoken = detected
        this.languageSwitches.push(detected)
        void fetch(`${BASE}/realtime/language`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voiceSessionId: this.voiceSessionId, language: detected }) })
          .then((r) => r.json() as Promise<{ session: Record<string, unknown> }>)
          .then((j) => this.send({ type: 'session.update', session: j.session }))
      })
    }
    this.ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(s.model)}`, ['realtime', `openai-insecure-api-key.${s.clientSecret}`])
    await new Promise<void>((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true })
      this.ws.addEventListener('error', () => reject(new Error('WebSocket failed to open')), { once: true })
    })
    this.ws.addEventListener('message', (m) => {
      const e = JSON.parse(String(m.data)) as Ev
      if (!e.type.endsWith('.delta')) {
        const detail = e.type === 'error' ? `(${(e.error as { code?: string; message?: string })?.code}: ${(e.error as { message?: string })?.message})` : e.type === 'response.done' ? `(${(e.response as { status?: string }).status})` : ''
        this.recent.push(`${e.type}${detail}`)
        if (this.recent.length > 40) this.recent.shift()
      }
      if (e.type === 'response.done') {
        const u = (e.response as { usage?: { input_token_details?: { audio_tokens?: number; text_tokens?: number; cached_tokens?: number }; output_token_details?: { audio_tokens?: number; text_tokens?: number } } }).usage
        if (u) {
          this.usage.inputAudio += u.input_token_details?.audio_tokens ?? 0
          this.usage.inputText += u.input_token_details?.text_tokens ?? 0
          this.usage.cached += u.input_token_details?.cached_tokens ?? 0
          this.usage.outputAudio += u.output_token_details?.audio_tokens ?? 0
          this.usage.outputText += u.output_token_details?.text_tokens ?? 0
        }
      }
      for (const l of this.listeners) l(e)
    })
    await this.next('session.created', 15_000)
  }

  send(e: Record<string, unknown>) {
    this.ws.send(JSON.stringify(e))
  }

  on(fn: (e: Ev) => void) {
    this.listeners.push(fn)
    return () => (this.listeners = this.listeners.filter((l) => l !== fn))
  }

  /** The last events seen, so a timeout says what the API was doing instead of just "timeout". */
  recent: string[] = []

  next(type: string, timeoutMs: number, where: (e: Ev) => boolean = () => true): Promise<Ev> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => (off(), reject(new Error(`timeout waiting for ${type}; last events: ${this.recent.slice(-12).join(', ')}`))), timeoutMs)
      const off = this.on((e) => {
        if (e.type === type && where(e)) {
          clearTimeout(timer)
          off()
          resolve(e)
        }
      })
    })
  }

  /** Streams speech in real time (200 ms of audio every 200 ms), as a microphone does. */
  async appendAudio(pcm: Buffer) {
    for (let i = 0; i < pcm.length; i += 9600) {
      this.send({ type: 'input_audio_buffer.append', audio: pcm.subarray(i, i + 9600).toString('base64') })
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  /**
   * After the seller stops talking, a microphone keeps sending (near-)silence. The turn detector needs that
   * continuing stream to decide the turn is over, so silence is streamed in real time until it does (max 12 s).
   */
  async padSilence() {
    let stopped = false
    const off = this.on((e) => {
      if (e.type === 'input_audio_buffer.speech_stopped') stopped = true
    })
    // Fresh noise each chunk, like a live microphone.
    for (let waited = 0; !stopped && waited < 12_000; waited += 200) {
      this.send({ type: 'input_audio_buffer.append', audio: silence(200).toString('base64') })
      await new Promise((r) => setTimeout(r, 200))
    }
    off()
  }

  /**
   * Speaks one seller turn and follows the answer to its end: tool calls run through Mini AI's relay, then the
   * final spoken answer. Returns what was heard, what was said, the tools, and timings.
   */
  async turn(say: string, opts: { stop?: boolean } = {}): Promise<TurnResult[]> {
    const results: TurnResult[] = []
    const audio = await speech(say)
    let heard = ''
    let reply = ''
    const tools: string[] = []
    // firstAudioAt: the first sound the seller hears this turn (often a short "let me check" before a tool call).
    let firstAudioAt = 0
    let responseCreatedAt = 0
    let speechStoppedAt = 0
    let toolMs = 0
    const offHeard = this.on((e) => {
      if (e.type === 'input_audio_buffer.speech_stopped' && !speechStoppedAt) speechStoppedAt = performance.now()
      if (e.type === 'conversation.item.input_audio_transcription.completed') heard += `${String(e.transcript ?? '').trim()} `
      if (e.type === 'response.created' && !responseCreatedAt) responseCreatedAt = performance.now()
      if (e.type === 'response.output_audio.delta' && !firstAudioAt) firstAudioAt = performance.now()
      if (e.type === 'response.output_audio_transcript.done') reply += `${String(e.transcript ?? '').trim()} `
    })
    await this.appendAudio(audio)
    const spokenAt = performance.now()
    void this.padSilence()

    // Follow responses until one finishes with no tool calls.
    for (let round = 0; round < 6; round++) {
      if (opts.stop && round === 0) {
        // The seller presses Stop speaking as soon as the answer starts: the app sends response.cancel.
        await this.next('response.output_audio.delta', 60_000)
        const stopAt = performance.now()
        const cancelled = this.next('response.done', 30_000)
        this.send({ type: 'response.cancel' })
        const done = await cancelled
        const status = String((done.response as { status?: string }).status)
        results.push({ said: say, heard: heard.trim(), reply: `${reply.trim()} [stopped]`, tools: [...tools], status, firstAudioMs: firstAudioAt ? Math.round(firstAudioAt - spokenAt) : null, responseMs: null, toolMs, interruptStopMs: Math.round(performance.now() - stopAt) })
        offHeard()
        return results
      }
      const done = await this.next('response.done', 90_000)
      const response = done.response as { status?: string; output?: Array<{ type?: string; call_id?: string; name?: string; arguments?: string }> }
      const calls = (response.output ?? []).filter((o) => o.type === 'function_call')
      if (!calls.length) {
        offHeard()
        results.push({
          said: say,
          heard: heard.trim(),
          reply: reply.trim(),
          tools,
          status: String(response.status),
          firstAudioMs: firstAudioAt ? Math.round(firstAudioAt - spokenAt) : null,
          vadToAudioMs: firstAudioAt && speechStoppedAt ? Math.round(firstAudioAt - speechStoppedAt) : null,
          responseMs: Math.round(performance.now() - spokenAt),
          toolMs,
        })
        return results
      }
      const t0 = performance.now()
      for (const c of calls) {
        tools.push(c.name!)
        const r = await fetch(`${BASE}/realtime/tool`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ voiceSessionId: this.voiceSessionId, callId: c.call_id, name: c.name, arguments: c.arguments ?? '{}' }),
        })
        const j = (await r.json()) as { output: string }
        this.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: c.call_id, output: j.output } })
      }
      toolMs += Math.round(performance.now() - t0)
      this.send({ type: 'response.create' })
    }
    offHeard()
    results.push({ said: say, heard: heard.trim(), reply: reply.trim(), tools, status: 'too many rounds', firstAudioMs: null, responseMs: null, toolMs })
    return results
  }

  close() {
    this.ws.close()
  }
}

/* ---------- Scenarios ---------- */

const hasDevanagari = (s: string) => /[ऀ-ॿ]/.test(s)
const mostlyLatin = (s: string) => (s.match(/[A-Za-z]/g)?.length ?? 0) > (s.match(/[ऀ-ॿ]/g)?.length ?? 0)
const all = (r: TurnResult[]) => r.map((x) => x.reply).join(' ')
const sentences = (r: TurnResult[]) => r.flatMap((x) => x.reply.split(/(?<=[.!?।])\s+/))
/**
 * The three overclaims from earlier milestones, checked sentence by sentence (as in the text evaluation):
 * stockouts called the main/clearest driver, the overall 14% called seller-side, and "18 of 20".
 * ("The biggest reason is Inventory Unavailable" ranks cancellation reasons by count: not a stockout-causation claim.)
 */
const noOverclaims = (r: TurnResult[]) =>
  !sentences(r).some((s) => /stock/i.test(s) && /\b(clearest|biggest|main|primary|key)\s+(drivers?|causes?|reasons?)\b/i.test(s) && !/\bnot\s+(a\s+|the\s+)?(proven|main|clearest|biggest)/i.test(s)) &&
  !sentences(r).some((s) => /seller[-\s]?(side|initiated)?\s+cancell?ations?/i.test(s) && /\b14\s?(%|percent)/i.test(s) && !/overall/i.test(s)) &&
  !/20 में से 18|18 (of|out of) (the |your )?20\b/i.test(all(r))
const noIds = (r: TurnResult[]) => !/\b(ACT|FIND)-[A-Z0-9]/.test(all(r))

const SCENARIOS: Scenario[] = [
  {
    id: 'en',
    title: 'English: sales, cancellations, stock, recommendations, follow-up',
    language: 'auto',
    turns: [
      { say: 'Why have my sales dropped this month?' },
      { say: 'What about cancellations?' },
      { say: 'Which products are out of stock right now?' },
      { say: 'Okay, what should I do first?' },
      { say: 'And how will I know if that worked?' },
    ],
    checks: [
      { name: 'investigates the sales drop before explaining', test: (r) => r[0].tools.some((t) => /investigateSalesDecline|investigateAccountHealth|getSellerOverview/.test(t)) },
      { name: 'states the 32.5% decline', test: (r) => /32\.5|thirty[- ]two point five|sixty[- ]five thousand|65,000/i.test(r[0].reply) },
      { name: 'cancellation answer says overall and separates initiators', test: (r) => /overall/i.test(r[1].reply) && /seller|customer/i.test(r[1].reply) },
      { name: 'stock answer names products', test: (r) => /earbud|t-shirt|sweatshirt|hoodie|shoe|bedsheet/i.test(r[2].reply) },
      { name: 'follow-up keeps context (answers how to verify)', test: (r) => /watch|track|monitor|check|measure|see/i.test(r[4].reply) },
      { name: 'answers in English', test: (r) => r.every((x) => mostlyLatin(x.reply)) },
      { name: 'no overclaims (stockout driver, seller-side 14%, 18 of 20)', test: noOverclaims },
      { name: 'no internal IDs spoken', test: noIds },
    ],
  },
  {
    id: 'hi',
    title: 'Hindi: sales, cancellations, inventory, recommendations, follow-up',
    language: 'auto',
    turns: [
      { say: 'मेरी बिक्री इस महीने क्यों कम हो गई है?' },
      { say: 'कैंसलेशन क्यों बढ़ रहे हैं?' },
      { say: 'कौन से प्रोडक्ट अभी स्टॉक में नहीं हैं?' },
      { say: 'मुझे सबसे पहले क्या करना चाहिए?' },
      { say: 'और इसका असर कैसे पता चलेगा?' },
    ],
    checks: [
      { name: 'recognises the Hindi question (Devanagari or Hindi words in the transcript)', test: (r) => hasDevanagari(r[0].heard) || /bikri|kam|kyon|kyun/i.test(r[0].heard) },
      { name: 'replies in Hindi', test: (r) => r.filter((x) => hasDevanagari(x.reply)).length >= 4 },
      { name: 'uses data for the sales question', test: (r) => r[0].tools.length > 0 || /32/.test(r[0].reply) },
      { name: 'states the decline figure', test: (r) => /32|बत्तीस|65|पैंसठ/.test(r[0].reply) },
      { name: 'no overclaims (stockout driver, seller-side 14%, 18 of 20)', test: noOverclaims },
      { name: 'no internal IDs spoken', test: noIds },
    ],
  },
  {
    id: 'hinglish',
    title: 'Hinglish, switching languages, product names and numbers',
    language: 'auto',
    turns: [
      { say: 'Mere sales kyun gir rahe hain? Thoda detail mein batao.' },
      { say: 'What about cancellations? Explain in English.' },
      { say: 'Ab Hindi mein samjhao, cancellation ka issue kya hai?' },
      { say: 'Wireless Bluetooth Earbuds ka return rate kitna hai?' },
    ],
    checks: [
      { name: 'first reply is Hinglish or Hindi, not plain English', test: (r) => hasDevanagari(r[0].reply) || /\b(hai|hain|aapke|mein|kyunki|ka|ki)\b/i.test(r[0].reply) },
      { name: 'switches to English when asked', test: (r) => mostlyLatin(r[1].reply) && !/\b(hai|hain|aapke)\b/i.test(r[1].reply) },
      { name: 'switches back to Hindi when asked', test: (r) => hasDevanagari(r[2].reply) || /\b(hai|hain|aapke|mein)\b/i.test(r[2].reply) },
      { name: 'answers the product question with its real return rate (57.1%) or return count', test: (r) => /57|सत्तावन|fifty[- ]seven|4 (of|में से) 7|7 में से 4|four (out )?of seven/i.test(r[3].reply) },
      { name: 'no overclaims', test: noOverclaims },
      { name: 'no internal IDs spoken', test: noIds },
    ],
  },
  {
    // Voice barge-in depends on playback, which only WebRTC tracks; it is tested with the real microphone.
    // Over WebSocket this tests the Stop speaking path the app sends (response.cancel), then a fresh question.
    id: 'stop',
    title: 'Stop speaking, then a new question',
    language: 'en',
    turns: [{ say: 'Give me a complete business review of my account.', interruptAfterMs: 0 }, { say: 'Just tell me my cancellation rate.' }],
    checks: [
      { name: 'Stop speaking cancels the answer', test: (r) => r[0].status === 'cancelled' },
      { name: 'the next question is answered with the overall rate', test: (r) => r.length > 1 && /14|fourteen/i.test(r.at(-1)!.reply) && /overall/i.test(r.at(-1)!.reply) },
    ],
  },
  {
    id: 'approval',
    title: 'Action Tracker: Mini AI proposes, never approves',
    language: 'en',
    turns: [{ say: 'What is the most urgent thing to fix?' }, { say: 'Yes, add the restock action to my tracker please.' }],
    checks: [
      { name: 'adds it via the tool', test: (r) => r[1].tools.includes('proposeTrackerAction') },
      { name: 'says it awaits approval', test: (r) => /approv/i.test(r[1].reply) },
      { name: 'never claims it is approved or done', test: (r) => !/\b(is|has been|now) (approved|done|completed)\b|I('ve| have) approved/i.test(all(r)) },
    ],
  },
]

/* ---------- Run ---------- */

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',')
const lines: string[] = []
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
let passed = 0
let total = 0
const totals = { inputAudio: 0, inputText: 0, cached: 0, outputAudio: 0, outputText: 0 }

const health = (await (await fetch(`${BASE}/realtime/health`)).json()) as { model: string; voice: string }
lines.push(`# Live voice evaluation (OpenAI ${health.model}, voice ${health.voice})`, `Run ${new Date().toISOString()} · seller speech generated with gpt-4o-mini-tts (synthetic audio, not a microphone)`, '')

for (const scenario of SCENARIOS.filter((s) => !only || only.includes(s.id))) {
  console.log(`\n== ${scenario.id}: ${scenario.title}`)
  lines.push(`## ${scenario.id}: ${scenario.title}`, '')
  const call = new Call()
  const results: TurnResult[] = []
  try {
    await call.open(scenario.language)
    // Greeting, as the app does when a call opens.
    const greetingDone = call.next('response.done', 60_000)
    let greeting = ''
    const off = call.on((e) => e.type === 'response.output_audio_transcript.done' && (greeting += String(e.transcript ?? '')))
    call.send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: '[Call started] The seller just opened live voice. Greet them in at most two short sentences using the account snapshot, and ask what they would like to look at. Do not call a tool for this.' }] } })
    call.send({ type: 'response.create' })
    await greetingDone
    off()
    lines.push(`**Greeting:** ${greeting.trim()}`, '')
    for (const turn of scenario.turns) {
      const r = await call.turn(turn.say, turn.interruptAfterMs !== undefined ? { stop: true } : {})
      results.push(...r)
      for (const x of r) {
        console.log(`  seller: ${x.said}\n  heard:  ${x.heard}\n  tools:  ${x.tools.join(', ') || 'none'}\n  reply:  ${x.reply}\n  status: ${x.status} · first audio ${x.firstAudioMs ?? '–'} ms (${x.vadToAudioMs ?? '–'} ms after end of turn) · tools ${x.toolMs} ms${x.interruptStopMs != null ? ` · stopped ${x.interruptStopMs} ms after barge-in` : ''}`)
        lines.push(
          `**Seller said:** ${x.said}`,
          `**Model heard:** ${x.heard || '(no transcript)'}`,
          `*Tools: ${x.tools.join(', ') || 'none'} · status ${x.status} · first audio ${x.firstAudioMs ?? '–'} ms after the seller's audio ended, ${x.vadToAudioMs ?? '–'} ms after the turn detector decided they had finished · tools ${x.toolMs} ms${x.responseMs ? ` · complete ${x.responseMs} ms` : ''}${x.interruptStopMs != null ? ` · answer stopped ${x.interruptStopMs} ms after the barge-in audio began` : ''}*`,
          `**Mini AI said:** ${x.reply || '(nothing)'}`,
          '',
        )
      }
    }
  } catch (error) {
    lines.push(`**Error:** ${error instanceof Error ? error.message : String(error)}`, '')
    console.log(`  ERROR ${error instanceof Error ? error.message : error}`)
  } finally {
    call.close()
    for (const k of Object.keys(totals) as Array<keyof typeof totals>) totals[k] += call.usage[k]
  }
  for (const check of scenario.checks) {
    let ok = false
    try {
      ok = results.length > 0 && check.test(results)
    } catch {
      ok = false
    }
    total++
    if (ok) passed++
    lines.push(`- ${ok ? 'PASS' : 'CHECK'}: ${check.name}`)
    console.log(`${ok ? 'PASS ' : 'CHECK'} ${scenario.id} · ${check.name}`)
  }
  lines.push('')
}

// gpt-realtime-2.1 list prices per 1M tokens (developers.openai.com, Nov 2026): text in $4 / cached $0.4 / out $24; audio in $32 / cached $0.4 / out $64.
// Cached tokens are part of the input count and billed at the cached rate (the reused context is almost all text).
const cost =
  (totals.inputAudio * 32 + Math.max(0, totals.inputText - totals.cached) * 4 + totals.cached * 0.4 + totals.outputAudio * 64 + totals.outputText * 24) / 1_000_000
lines.push(
  '## Usage',
  '',
  `Tokens: input audio ${totals.inputAudio}, input text ${totals.inputText} (cached ${totals.cached}), output audio ${totals.outputAudio}, output text ${totals.outputText}.`,
  `Approximate cost at list prices: $${cost.toFixed(3)} (cached tokens are counted at the cached rate and also within input, so this slightly overstates).`,
  '',
  `**Total: ${passed} of ${total} checks passed.**`,
)
mkdirSync(new URL('../eval-results/', import.meta.url), { recursive: true })
const file = new URL(`../eval-results/realtime-${stamp}.md`, import.meta.url)
writeFileSync(file, lines.join('\n'))
console.log(`\n${passed} of ${total} checks passed. Approx. cost $${cost.toFixed(3)}. Transcript: ${file.pathname}`)
server.close()
process.exit(0)
