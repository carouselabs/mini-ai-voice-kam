// Live check of the Milestone 4 flow in the real app with the real model (not the test model):
//   node scripts/m4-live-ui.mjs http://localhost:4103
// Start the server first with the OpenAI key from server/.env and a throwaway MINI_AI_RUNTIME_DIR.
// Speech is muted (no audio); everything else is the production path: HTTP, SSE, tools, UI.
// Writes screenshots to ./shots/m4 and a transcript to server/eval-results/live-ui-*.md.
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4103'
const OUT = new URL('../shots/m4/', import.meta.url)
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
await context.addInitScript(() => window.localStorage.setItem('mini-ai.voice-muted', 'true'))
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const shot = (name) => page.screenshot({ path: new URL(`${name}.png`, OUT).pathname.slice(1) })
const log = []
const panel = page.getByTestId('assistant-panel')
const messages = panel.getByTestId('assistant-message')

async function ask(text) {
  const before = await messages.count()
  const started = Date.now()
  const input = panel.getByRole('textbox', { name: 'Message your Virtual KAM' })
  await input.fill(text)
  await input.press('Enter')
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="assistant-message"]').length > n, before, { timeout: 120_000 })
  await page.waitForTimeout(600)
  const answer = messages.nth(before)
  const reply = (await answer.locator('p').first().innerText()).replace(/^Mini AI:\s*/, '')
  log.push(`**Seller:** ${text}`, '', `**Mini AI** (${((Date.now() - started) / 1000).toFixed(1)} s): ${reply}`, '', `*${(await answer.locator('p').nth(1).innerText().catch(() => '')) || 'no checks line'}*`, '')
  return answer
}

const health = await (await fetch(`${BASE}/api/ai/health`)).json()
if (health.provider !== 'openai' || !health.configured) throw new Error(`Not a live OpenAI server: ${JSON.stringify(health)}`)

await page.goto(BASE)
await page.getByTestId('ai-orb').click()
await messages.first().waitFor({ timeout: 120_000 })
await page.waitForTimeout(600)
log.push(`# Live UI check (${health.model}, ${new Date().toISOString()})`, '', `**Greeting:** ${(await messages.first().locator('p').first().innerText()).replace(/^Mini AI:\s*/, '')}`, '')
if (/\[Test model\]/.test(await messages.first().innerText())) throw new Error('Reply came from the test model')

await ask('What should I fix first?')
await shot('live-ui-recommendations')
const answer = await ask('Okay, add the restock action to my tracker.')
const card = answer.getByTestId('approval-card')
await card.waitFor({ timeout: 10_000 })
const statusBefore = await card.getAttribute('data-status')
await shot('live-ui-approval')
const tracker = await (await fetch(`${BASE}/api/tracker`)).json()
const entry = tracker.data.actions[0]
log.push(`Tracker entry after the request: ${entry.title} · ${entry.status} · created by ${entry.createdBy} · approvedAt ${entry.approvedAt}`, '')

await card.getByRole('button', { name: 'Approve' }).click()
await page.locator('[data-testid="approval-card"][data-status="Approved"]').waitFor()
const after = await (await fetch(`${BASE}/api/tracker`)).json()
log.push(`After the seller pressed Approve: ${after.data.actions[0].status}`, '')
await shot('live-ui-approved')

const ok = statusBefore === 'Awaiting Approval' && entry.createdBy === 'mini-ai' && entry.approvedAt === null && after.data.actions[0].status === 'Approved'
log.push(`Result: ${ok ? 'PASS' : 'FAIL'} (approval card ${statusBefore}; page errors: ${errors.length})`)
await mkdir(new URL('../server/eval-results/', import.meta.url), { recursive: true })
const file = new URL(`../server/eval-results/live-ui-${new Date().toISOString().replace(/[:.]/g, '-')}.md`, import.meta.url)
await writeFile(file, log.join('\n'))
await browser.close()
console.log(log.join('\n'))
if (!ok || errors.length) process.exitCode = 1
