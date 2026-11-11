// LEGACY (browser speech, before Milestone 6). Live voice session recorder for the old browser voice: opens Chrome, lets you talk to
// Mini AI, and when you close the window writes what happened to server/eval-results/:
// the server's own transcript (spoken vs typed), replies, speech-synthesis events, timings and a summary.
//
//   node scripts/voice-live.mjs [baseUrl] [minutes]      e.g. node scripts/voice-live.mjs http://localhost:4000 10
//
// Start the app first (npm run build, then npm start → http://localhost:4000) with your OpenAI key in server/.env.
// Nothing is recorded as audio. Chrome sends microphone audio to its own speech service for recognition.
// The voice code is not changed by this script; it only listens to what the page does.
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4000'
const MINUTES = Number(process.argv[3] ?? 10)
const origin = new URL(BASE).origin

const health = await fetch(`${BASE}/api/ai/health`).then((r) => r.json()).catch(() => null)
if (!health) {
  console.error(`Nothing is answering at ${BASE}. Start the app first (npm run build, then npm start).`)
  process.exit(1)
}
if (health.provider !== 'openai' || !health.configured) {
  console.error(`The server at ${BASE} is not using a live model (${health.provider}, configured: ${health.configured}). Put OPENAI_API_KEY in server/.env and restart.`)
  process.exit(1)
}

const browser = await chromium.launch({ channel: 'chrome', headless: false })
const context = await browser.newContext({ viewport: null })
await context.grantPermissions(['microphone'], { origin })
const page = await context.newPage()

const t0 = Date.now()
const at = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`
const events = []
const timings = []
const sessions = new Map() // sessionId → latest transcript

page.on('console', (m) => {
  if (m.text().startsWith('[Mini AI timing]')) {
    const json = m.text().slice(17).trim()
    events.push(`${at()} timing ${json}`)
    try {
      timings.push(JSON.parse(json))
    } catch {
      // not JSON: kept in the event log only
    }
  } else if (m.type() === 'error') events.push(`${at()} console error: ${m.text()}`)
})
page.on('response', async (res) => {
  if (!res.url().includes('/api/ai/')) return
  if (res.request().method() === 'POST') events.push(`${at()} ${res.request().method()} ${new URL(res.url()).pathname} → ${res.status()}`)
  if (res.url().endsWith('/api/ai/sessions')) {
    const body = await res.text().catch(() => '')
    const id = body.match(/"sessionId":"([^"]+)"/)?.[1]
    if (id && !sessions.has(id)) sessions.set(id, [])
  }
})

// Ending a conversation deletes it on the server, so the transcript is saved every few seconds while you talk.
async function saveTranscripts() {
  for (const id of sessions.keys()) {
    const res = await fetch(`${BASE}/api/ai/sessions/${id}`).catch(() => null)
    if (res?.ok) sessions.set(id, (await res.json()).transcript)
  }
}
const poll = setInterval(() => void saveTranscripts(), 3000)

await page.exposeFunction('__ttsEvent', (e) => events.push(`${at()} speech ${e}`))
await page.addInitScript(() => {
  const speak = window.speechSynthesis.speak.bind(window.speechSynthesis)
  window.speechSynthesis.speak = (u) => {
    window.__ttsEvent(`queued (${u.lang}, ${u.voice?.name ?? 'default voice'}): ${u.text}`)
    u.addEventListener('start', () => window.__ttsEvent(`started: ${u.text.slice(0, 60)}`))
    u.addEventListener('end', () => window.__ttsEvent(`ended: ${u.text.slice(0, 60)}`))
    u.addEventListener('error', (e) => window.__ttsEvent(`error ${e.error}: ${u.text.slice(0, 60)}`))
    speak(u)
  }
})

await page.goto(BASE)
console.log(`
Chrome is open at ${BASE} (live model: ${health.model}). Please do these, speaking into the microphone:

  1. Open Mini AI (the purple button) and let it greet you.
  2. Press the microphone and ask about your declining sales, e.g. "My sales have dropped, what is happening?"
  3. Listen to the answer.
  4. While it is speaking, interrupt it: press "Stop speaking" or the microphone, and ask something new.
  5. Ask which products need restocking.
  6. Correct it with something it cannot know, e.g. "I already ordered the T-shirts, they arrive Friday."
  7. End the conversation with the X in the panel, then close the Chrome window.

The window closes on its own after ${MINUTES} minutes.`)
await Promise.race([page.waitForEvent('close', { timeout: 0 }), new Promise((r) => setTimeout(r, MINUTES * 60_000))])
clearInterval(poll)
await saveTranscripts()
await browser.close().catch(() => {})

/* ---------- Summary: measured facts only; whether answers were right is for a person to judge ---------- */
const all = [...sessions.entries()]
const turns = all.flatMap(([, t]) => t)
const spoken = turns.filter((t) => t.role === 'seller' && t.via === 'voice')
const typed = turns.filter((t) => t.role === 'seller' && t.via !== 'voice')
const interruptions = events.filter((e) => /speech error (interrupted|canceled)/.test(e)).length
const errors = events.filter((e) => /console error|POST .* → [45]\d\d/.test(e))
// The page logs a turn's timing when the reply arrives and again when speech starts; the later entry is complete.
const spokenTurns = timings.filter((t) => typeof t.firstSpeechMs === 'number')
const firstSpeech = spokenTurns.map((t) => t.firstSpeechMs)
const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null)

mkdirSync(new URL('../server/eval-results/', import.meta.url), { recursive: true })
const file = new URL(`../server/eval-results/voice-live-${new Date().toISOString().replace(/[:.]/g, '-')}.md`, import.meta.url)
const lines = [
  `# Live voice session (${new Date().toISOString()})`,
  '',
  `Model: ${health.model} · conversations: ${all.length}`,
  '',
  '## Summary (measured)',
  '',
  `- Spoken questions: ${spoken.length}; typed: ${typed.length}`,
  `- What Chrome recognised: ${spoken.map((t) => `“${t.text}” (${t.recognitionMs ?? '?'} ms)`).join('; ') || 'nothing'}`,
  `- Speech stopped while speaking (interruptions): ${interruptions}`,
  `- From sending a question to the first spoken words: ${firstSpeech.length ? `median ${median(firstSpeech)} ms (${firstSpeech.join(', ')} ms)` : 'not measured'}`,
  `- Errors seen: ${errors.length ? errors.join('; ') : 'none'}`,
  '',
  'Whether Mini AI understood each question and kept the context is judged by a person from the transcript below.',
  '',
  ...all.flatMap(([id, transcript], i) => [
    `## Conversation ${i + 1} (${id})`,
    '',
    ...transcript.map((t) =>
      t.role === 'seller'
        ? `**Seller (${t.via ?? 'text'}${t.recognitionMs !== undefined ? `, recognised in ${t.recognitionMs} ms` : ''}):** ${t.text}`
        : `**Mini AI** (server ${t.timing?.totalMs ?? '?'} ms: model ${t.timing?.modelMs ?? '?'} ms over ${t.timing?.modelRounds ?? '?'} rounds, tools ${t.timing?.toolMs ?? '?'} ms${t.timing?.tools?.length ? ` [${t.timing.tools.map((x) => `${x.label} ${x.ms} ms`).join(', ')}]` : ''}): ${t.text}`,
    ),
    '',
  ]),
  '## Browser events',
  '',
  ...events.map((e) => `- ${e}`),
  '',
]
writeFileSync(file, lines.join('\n'))
console.log(`Saved ${file.pathname}`)
