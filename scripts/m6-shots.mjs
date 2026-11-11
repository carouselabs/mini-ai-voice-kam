// Screenshots of the live voice UI for the report, using a SCRIPTED fake connection (no OpenAI, no microphone).
// The real-model, real-WebRTC screenshot comes from scripts/realtime-browser-check.mjs.
//   node scripts/m6-shots.mjs http://localhost:4101   (a server with AI_PROVIDER=mock)
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4101'
const OUT = new URL('../shots/m6/', import.meta.url)
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()

async function run(name, viewport, script) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.addInitScript(() => {
    const rt = { handler: () => {}, sent: [] }
    window.__rt = rt
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => new AudioContext().createMediaStreamDestination().stream } })
    window.__miniAiFakeRealtime = async () => ({ send: (e) => rt.sent.push(e), close: () => {}, remoteStream: null, onEvent: (h) => (rt.handler = h), onDrop: () => {} })
  })
  await page.goto(BASE)
  await page.getByTestId('ai-orb').click()
  await page.getByTestId('assistant-message').first().waitFor({ timeout: 15000 })
  await page.getByTestId('live-voice-button').click()
  await page.waitForTimeout(300)
  await script(page)
  await page.screenshot({ path: new URL(`${name}.png`, OUT).pathname.slice(1) })
  await context.close()
}
const emit = (page, e) => page.evaluate((x) => window.__rt.handler(x), e)

async function conversation(page) {
  await page.getByRole('button', { name: 'Start live voice' }).click()
  await page.waitForTimeout(300)
  await emit(page, { type: 'response.output_audio_transcript.done', item_id: 'g', transcript: 'Hi, I’m Mini AI. Your sales are down 32.5 percent, mostly from fewer orders. What would you like to look at first?' })
  await emit(page, { type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Why did my sales drop?' })
  await emit(page, { type: 'response.done', response: { status: 'completed', output: [{ type: 'function_call', call_id: 'c1', name: 'investigateSalesDecline', arguments: '{}' }] } })
  await page.getByTestId('live-tool').waitFor()
  await page.waitForTimeout(500)
  await emit(page, { type: 'response.output_audio_transcript.delta', item_id: 'a1', delta: 'Sales fell 32.5 percent, about 65,000 rupees: 130 fewer orders at the same 500-rupee price. Stockouts are a likely contributor, though their share isn’t measured yet.' })
  await emit(page, { type: 'output_audio_buffer.started' })
  await page.waitForTimeout(300)
}

await run('live-voice-start-desktop', { width: 1440, height: 900 }, async () => {})
await run('live-voice-call-desktop', { width: 1440, height: 900 }, conversation)
await run('live-voice-call-phone', { width: 412, height: 915 }, conversation)
await browser.close()
console.log('saved shots/m6 (scripted fake connection)')
