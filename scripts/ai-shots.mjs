// Screenshots of the AI Brain in its main states, using the scripted test model and scripted speech.
//   AI_PROVIDER=mock AI_MOCK_DELAY_MS=2500 PORT=4100 node server/src/index.ts   (then)   node scripts/ai-shots.mjs
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4100'
await mkdir('shots', { recursive: true })
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await page.addInitScript(() => {
  const state = { hold: true }
  window.__speech = state
  class FakeRecognition {
    start() {
      setTimeout(() => this.onstart?.(), 30)
      setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'Customers are cancelling' }], { isFinal: false })] }), 300)
      setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'Customers are cancelling unnecessarily' }], { isFinal: true })] }), 2600)
      setTimeout(() => this.onend?.(), 2700)
    }
    stop() {}
  }
  window.SpeechRecognition = FakeRecognition
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } })
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t } }
  Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [], cancel() {}, speak(u) { setTimeout(() => u.onstart?.(), 10); if (!state.hold) setTimeout(() => u.onend?.(), 50) } } })
})
const shot = (name) => page.screenshot({ path: `shots/ai-${name}.png` })
await page.goto(BASE)
await page.getByRole('heading', { level: 1 }).waitFor()
await page.waitForTimeout(800)
await shot('idle')
await page.getByTestId('ai-orb').click()
await page.getByTestId('assistant-activity').waitFor()
await page.waitForTimeout(300)
await shot('investigating-greeting')
await page.getByTestId('assistant-message').first().waitFor({ timeout: 30000 })
await page.waitForTimeout(400)
await shot('speaking')
await page.evaluate(() => (window.__speech.hold = false))
await page.getByRole('button', { name: 'Stop speaking' }).click()
await page.getByTestId('mic-button').click()
await page.getByTestId('live-transcript').waitFor()
await page.waitForTimeout(500)
await shot('listening')
await page.getByTestId('assistant-activity').waitFor({ timeout: 15000 })
await page.waitForTimeout(2900)
await shot('investigating')
await page.getByTestId('assistant-message').nth(1).waitFor({ timeout: 30000 })
await page.getByTestId('assistant-message').nth(1).getByRole('button', { name: /Show evidence/ }).click()
await page.waitForTimeout(400)
await shot('evidence')
await browser.close()
console.log('AI state screenshots written to shots/ai-*.png')
