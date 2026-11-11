// Real-browser voice check: Google Chrome's own speech recognition hears a WAV file played as the
// microphone, the transcript goes to the backend, and the reply goes through speech synthesis.
//
//   node scripts/voice-check.mjs [baseUrl] [wav] [--headed]
//
// Needs Google Chrome (not the Playwright Chromium build) and an internet connection, because
// Chrome sends recognition audio to its speech service. Prints the transcript and what was spoken.
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const BASE = args[0] ?? 'http://localhost:4100'
const WAV = resolve(args[1] ?? 'scripts/voice/sales-question.wav')
const headed = process.argv.includes('--headed')

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !headed,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${WAV}`],
})
const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const log = []
page.on('console', (m) => m.type() === 'error' && log.push(`console error: ${m.text()}`))

// Observe speech synthesis without replacing it.
await page.addInitScript(() => {
  window.__tts = []
  const speak = window.speechSynthesis.speak.bind(window.speechSynthesis)
  window.speechSynthesis.speak = (u) => {
    window.__tts.push({ event: 'queued', text: u.text, lang: u.lang, voice: u.voice?.name ?? '(default)' })
    u.addEventListener('start', () => window.__tts.push({ event: 'start', text: u.text.slice(0, 40) }))
    u.addEventListener('end', () => window.__tts.push({ event: 'end', text: u.text.slice(0, 40) }))
    u.addEventListener('error', (e) => window.__tts.push({ event: 'error', error: e.error }))
    speak(u)
  }
})

const time = () => new Date().toISOString().slice(11, 19)
await page.goto(BASE)
await page.getByTestId('ai-orb').click()
const panel = page.getByTestId('assistant-panel')
await panel.getByTestId('assistant-message').first().waitFor({ timeout: 90_000 })
console.log(`${time()} greeting: ${await panel.getByTestId('assistant-message').first().innerText()}`)

await page.waitForTimeout(500)
await panel.getByTestId('mic-button').click()
console.log(`${time()} microphone pressed; status: ${await panel.getByTestId('assistant-status').innerText()}`)

const sellerLine = panel.getByRole('log').locator('li').filter({ hasText: 'You (spoken)' }).first()
try {
  await sellerLine.waitFor({ timeout: 45_000 })
  console.log(`${time()} recognised: ${await sellerLine.innerText()}`)
  await panel.getByTestId('assistant-message').nth(1).waitFor({ timeout: 150_000 })
  console.log(`${time()} reply: ${await panel.getByTestId('assistant-message').nth(1).innerText()}`)
  await page.waitForTimeout(6000)
} catch {
  console.log(`${time()} no transcript. Hint shown: ${await panel.getByTestId('voice-hint').innerText()}`)
}

const tts = await page.evaluate(() => window.__tts)
console.log('\nSpeech synthesis events:')
for (const e of tts) console.log(' ', JSON.stringify(e))
await page.screenshot({ path: 'shots/voice-check.png' })
if (log.length) console.log(`\n${log.join('\n')}`)
await browser.close()
