// REAL MICROPHONE test of live voice (OpenAI Realtime over WebRTC, Milestone 6).
// Opens Google Chrome on Mini AI's live voice, you talk, and when you close the window it saves what happened to
// server/eval-results/voice-live-*.md: the server's transcript of the call, every data tool it ran, timings
// measured in the browser (connection, first audio, interruption) and token usage. No audio is recorded.
//
//   npm run voice:live                       (app at http://localhost:4000, 15 minutes)
//   node scripts/voice-live.mjs <baseUrl> <minutes>
//
// Start the app first in another terminal: npm run build, then npm start (needs OPENAI_API_KEY in server/.env).
// The old browser-speech recorder is scripts/voice-live-browser.mjs (npm run voice:live:browser).
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4000'
const MINUTES = Number(process.argv[3] ?? 15)
const origin = new URL(BASE).origin

const health = await fetch(`${BASE}/api/realtime/health`).then((r) => r.json()).catch(() => null)
if (!health) {
  console.error(`Nothing is answering at ${BASE}. Start the app first: npm run build, then npm start.`)
  process.exit(1)
}
if (!health.available || health.provider !== 'openai') {
  console.error(`Live voice is not available at ${BASE}: ${health.reason ?? health.provider}. Put OPENAI_API_KEY in server/.env and restart.`)
  process.exit(1)
}

const browser = await chromium.launch({ channel: 'chrome', headless: false })
const context = await browser.newContext({ viewport: null })
await context.grantPermissions(['microphone'], { origin })
const page = await context.newPage()

const t0 = Date.now()
const at = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`
const events = []
const measures = []
const calls = new Map() // voiceSessionId → { transcript, toolCalls }

page.on('console', (m) => {
  const text = m.text()
  if (text.startsWith('[Mini AI realtime]')) {
    const json = text.slice(18).trim()
    events.push(`${at()} ${json}`)
    try {
      measures.push(JSON.parse(json))
    } catch {
      // kept in the event log
    }
  } else if (m.type() === 'error') events.push(`${at()} console error: ${text}`)
})
page.on('response', async (res) => {
  const url = res.url()
  if (!url.includes('/api/realtime/')) return
  if (url.endsWith('/api/realtime/session') && res.request().method() === 'POST') {
    const body = await res.json().catch(() => null)
    // Only the id is kept; the short-lived secret is never written anywhere.
    if (body?.voiceSessionId) calls.set(body.voiceSessionId, { transcript: [], toolCalls: [], language: body.language })
    events.push(`${at()} new call ${body?.voiceSessionId ?? '(failed)'} → ${res.status()}`)
  } else if (res.status() >= 400) events.push(`${at()} ${res.request().method()} ${new URL(url).pathname} → ${res.status()}`)
})

// Ending a call keeps its record on the server for an hour; it is read every few seconds anyway.
async function readCalls() {
  for (const id of calls.keys()) {
    const res = await fetch(`${BASE}/api/realtime/session/${id}`).catch(() => null)
    if (res?.ok) calls.set(id, await res.json())
  }
}
const poll = setInterval(() => void readCalls(), 4000)

await page.goto(BASE)
await page.getByTestId('ai-orb').click()
await page.getByTestId('live-voice-button').click().catch(() => {})
console.log(`
Chrome is open at ${BASE} on Live voice (OpenAI ${health.model}, voice ${health.voice}).
Press "Start live voice", allow the microphone, and just talk (no button per sentence). Please try:

  ENGLISH   1. "Why have my sales dropped?"   2. "What about cancellations?"
  HINDI     3. "मेरी बिक्री क्यों कम हो गई है?"   4. "मुझे पहले क्या करना चाहिए?"
  HINGLISH  5. "Mere sales kyun gir rahe hain? Stock ka issue hai kya?"
  SWITCH    6. "Explain that in English."   then   "Hindi mein samjhao."
  INTERRUPT 7. While Mini AI is speaking, start talking: it should stop and answer you.
  FOLLOW-UP 8. "And how will I know if that worked?"
  END       9. Press "End call", then close the Chrome window.

The window closes on its own after ${MINUTES} minutes.`)
await Promise.race([page.waitForEvent('close', { timeout: 0 }), new Promise((r) => setTimeout(r, MINUTES * 60_000))])
clearInterval(poll)
await readCalls()
await browser.close().catch(() => {})

/* ---------- Summary: measured facts; whether answers were right is judged by a person from the transcript ---------- */
const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null)
const of = (kind, key) => measures.filter((m) => m.kind === kind && typeof m[key] === 'number').map((m) => m[key])
const connect = of('connected', 'connectMs')
const firstAudio = of('first_audio', 'firstAudioMs').filter((n) => n >= 0)
const interrupts = of('interrupted', 'stopMs')
const ended = measures.filter((m) => m.kind === 'ended').map((m) => m.usage)
const usage = ended.reduce((a, u) => ({ inA: a.inA + (u?.inputAudio ?? 0), inT: a.inT + (u?.inputText ?? 0), c: a.c + (u?.cachedInput ?? 0), outA: a.outA + (u?.outputAudio ?? 0), outT: a.outT + (u?.outputText ?? 0) }), { inA: 0, inT: 0, c: 0, outA: 0, outT: 0 })
// List prices per million tokens (OpenAI pricing page, November 2026). Cached input is billed at the cached rate.
const PRICES = {
  'gpt-realtime-2.1': { inA: 32, inT: 4, cached: 0.4, outA: 64, outT: 24 },
  'gpt-realtime-2.1-mini': { inA: 10, inT: 0.6, cached: 0.06, outA: 20, outT: 2.4 },
}
const price = PRICES[health.model] ?? null
const cost = price
  ? (usage.inA * price.inA + Math.max(0, usage.inT - usage.c) * price.inT + usage.c * price.cached + usage.outA * price.outA + usage.outT * price.outT) / 1_000_000
  : null
const transcript = [...calls.values()].flatMap((c) => c.transcript ?? [])
const spoken = transcript.filter((t) => t.role === 'seller')
const toolCalls = [...calls.values()].flatMap((c) => c.toolCalls ?? [])
const errors = events.filter((e) => /console error| → [45]\d\d/.test(e))

mkdirSync(new URL('../server/eval-results/', import.meta.url), { recursive: true })
const file = new URL(`../server/eval-results/voice-live-${new Date().toISOString().replace(/[:.]/g, '-')}.md`, import.meta.url)
const lines = [
  `# Live voice: real microphone session (${new Date().toISOString()})`,
  '',
  `OpenAI ${health.model}, voice ${health.voice}. Calls: ${calls.size}.`,
  '',
  '## Measured',
  '',
  `- Seller turns recognised: ${spoken.length}`,
  `- What was recognised: ${spoken.map((t) => `“${t.text}”`).join(' · ') || 'nothing'}`,
  `- Connection set-up: ${connect.length ? `${connect.join(', ')} ms` : 'not measured'}`,
  `- End of speech → first audio: ${firstAudio.length ? `median ${median(firstAudio)} ms (${firstAudio.join(', ')} ms)` : 'not measured'}`,
  `- Interruptions (audio stopped after the seller spoke or pressed Stop): ${interrupts.length ? `${interrupts.length}, median ${median(interrupts)} ms to stop` : 'none measured'}`,
  `- Data tools run: ${toolCalls.map((c) => `${c.name}${c.ok ? '' : ' (failed)'}`).join(', ') || 'none'}`,
  `- Tokens: input audio ${usage.inA}, input text ${usage.inT} (cached ${usage.c}), output audio ${usage.outA}, output text ${usage.outT}. ${cost === null ? `No price table for ${health.model}; cost not estimated.` : `Approx. cost $${cost.toFixed(3)} at list prices.`}`,
  `- Errors: ${errors.length ? errors.join('; ') : 'none'}`,
  '',
  'Judge from the transcript: did it understand each question, answer in the right language, keep context, stop when interrupted?',
  '',
  '## Transcript (as reported to the server)',
  '',
  ...transcript.map((t) => `**${t.role === 'seller' ? 'Seller' : 'Mini AI'}${t.interrupted ? ' (interrupted)' : ''}:** ${t.text}${t.timing && Object.keys(t.timing).length ? `  _(${Object.entries(t.timing).map(([k, v]) => `${k} ${v}`).join(', ')})_` : ''}`),
  '',
  '## Tool audit',
  '',
  ...toolCalls.map((c) => `- ${c.at} ${c.name} ${c.arguments} → ${c.ok ? 'ok' : 'failed'} (${c.ms} ms)`),
  '',
  '## Browser events',
  '',
  ...events.map((e) => `- ${e}`),
  '',
]
writeFileSync(file, lines.join('\n'))
console.log(`Saved ${file.pathname}`)
