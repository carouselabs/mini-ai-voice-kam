// Checks the real browser path of live voice without a person: Chrome with a FAKE microphone (a test tone, not
// speech) opens a live call over WebRTC to OpenAI from the page, and we confirm the call connects, the greeting is
// generated and its audio arrives. It cannot test understanding of speech; that is npm run voice:live.
//
//   node scripts/realtime-browser-check.mjs http://localhost:4000
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4000'
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext()
await context.grantPermissions(['microphone'], { origin: new URL(BASE).origin })
const page = await context.newPage()
const log = []
page.on('console', (m) => m.text().startsWith('[Mini AI realtime]') && log.push(m.text().slice(18).trim()))
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await page.goto(BASE)
await page.getByTestId('ai-orb').click()
await page.getByTestId('live-voice-button').click()
const live = page.getByTestId('live-voice')
const started = Date.now()
await live.getByRole('button', { name: 'Start live voice' }).click()
const status = live.getByTestId('live-status')
// Connected and the greeting is being spoken (or a clear error).
await page
  .waitForFunction(() => ['speaking', 'error'].includes(document.querySelector('[data-testid="live-voice"]')?.getAttribute('data-state') ?? ''), null, { timeout: 30_000 })
  .catch(() => {})
const state = await live.getAttribute('data-state')
if (state !== 'speaking') {
  console.log(JSON.stringify({ ok: false, state, status: await status.textContent(), events: log, errors }, null, 2))
  await browser.close()
  process.exit(1)
}
const speakingAfter = Date.now() - started
await page.waitForFunction(() => (document.querySelector('[data-testid="live-line-assistant"]')?.textContent ?? '').length > 20, null, { timeout: 30_000 })
const greeting = await live.getByTestId('live-line-assistant').first().textContent()
await page.screenshot({ path: 'shots/m6/live-voice-greeting.png' }).catch(() => {})
await live.getByRole('button', { name: 'End call', exact: true }).click()
await page.waitForFunction(() => document.querySelector('[data-testid="live-voice"]')?.getAttribute('data-state') === 'ended', null, { timeout: 10_000 })
console.log(JSON.stringify({ ok: true, speakingAfterMs: speakingAfter, status: await status.textContent(), greeting, events: log, errors }, null, 2))
await browser.close()
