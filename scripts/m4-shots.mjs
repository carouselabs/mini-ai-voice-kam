// Milestone 4 screenshots and a walk through the tracker flow: node scripts/m4-shots.mjs [baseUrl]
// Use a server with AI_PROVIDER=mock and a throwaway MINI_AI_RUNTIME_DIR; it adds tracker entries.
// Writes PNGs to ./shots/m4 (git-ignored).
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4101'
const OUT = new URL('../shots/m4/', import.meta.url)
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch()
const errors = []

async function open(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
  const p = await context.newPage()
  p.on('console', (m) => m.type() === 'error' && errors.push(`${p.url()}: ${m.text()}`))
  p.on('pageerror', (e) => errors.push(`${p.url()}: ${e.message}`))
  return p
}
const shot = (p, name, fullPage = true) => p.screenshot({ path: new URL(`${name}.png`, OUT).pathname.slice(1), fullPage })
async function visit(p, path, heading) {
  await p.goto(BASE + path)
  await p.getByRole('heading', { level: 1, name: heading }).waitFor()
  await p.waitForLoadState('networkidle')
  // Wait until every loading placeholder has been replaced by content.
  await p.waitForFunction(() => !document.querySelector('main .animate-pulse'), null, { timeout: 15000 })
  await p.waitForTimeout(300)
}

const d = await open({ width: 1440, height: 900 })

// Every new or completed page
for (const [name, path, heading] of [
  ['review', '/review', 'Business Review'],
  ['recommendations', '/recommendations', 'AI Recommendations'],
  ['tracker-empty', '/actions', 'Action Tracker'],
  ['delivery', '/delivery', 'Delivery & Fulfilment'],
  ['payments', '/payments', 'Payments & Settlements'],
  ['promotions', '/promotions', 'Promotions'],
  ['reviews', '/reviews', 'Ratings & Reviews'],
  ['settings-empty', '/settings', 'Settings'],
  ['help', '/help', 'Help & Support'],
  ['profile', '/profile', 'Seller profile'],
]) {
  await visit(d, path, heading)
  await shot(d, `desktop-${name}`)
}

// Business review: open one structured finding
await visit(d, '/review', 'Business Review')
await d.locator('[data-finding="FIND-SD-04"] button').first().click()
await d.locator('[data-finding="FIND-SD-04"]').scrollIntoViewIfNeeded()
await shot(d, 'desktop-review-finding', false)

// Recommendations → add to tracker (dialog), leave for approval
await visit(d, '/recommendations', 'AI Recommendations')
await d.locator('[data-action="ACT-001"]').getByRole('button', { name: 'Add to tracker' }).click()
await d.getByTestId('add-to-tracker').waitFor()
await shot(d, 'desktop-add-dialog', false)
await d.getByRole('button', { name: 'Add, approve later' }).click()
await d.locator('[data-action="ACT-001"][data-state="awaiting_approval"]').waitFor()

// Reject one with a reason
await d.locator('[data-action="ACT-010"]').getByRole('button', { name: 'Reject' }).click()
await d.getByLabel('Why? (optional, helps Mini AI)').fill('The brand sets the speaker price')
await d.getByRole('button', { name: 'Reject', exact: true }).last().click()
await d.locator('[data-action="ACT-010"]').waitFor({ state: 'detached' })
await d.getByRole('button', { name: 'Completed & rejected' }).click()
await d.locator('[data-action="ACT-010"][data-state="rejected"]').waitFor()
await shot(d, 'desktop-recommendations-rejected', false)

// Tracker: approve, start, overdue, note
await visit(d, '/actions', 'Action Tracker')
await shot(d, 'desktop-tracker-awaiting', false)
await d.getByRole('button', { name: 'Approve' }).first().click()
await d.locator('[data-status="Approved"]').first().waitFor()
const row = d.locator('[data-tracker]').first()
await row.getByRole('combobox').selectOption('In Progress')
await d.locator('[data-status="In Progress"]').first().waitFor()
await row.getByRole('button', { name: 'Details' }).click()
await row.getByLabel('Add a note').fill('Supplier confirmed the T-shirt restock for Friday.')
await row.getByRole('button', { name: 'Add', exact: true }).click()
await row.getByText('Supplier confirmed the T-shirt restock for Friday.').waitFor()
await row.getByLabel('Due date').fill('2026-11-01')
await d.getByText('Overdue', { exact: true }).first().waitFor()
await d.waitForTimeout(300)
await shot(d, 'desktop-tracker-progress')

// Assistant: ask it to add an action; it can only propose
await d.getByTestId('ai-orb').click()
await d.getByTestId('assistant-message').first().waitFor()
const ask = async (text) => {
  const before = await d.getByTestId('assistant-message').count()
  const box = d.getByRole('textbox', { name: 'Message your Virtual KAM' })
  await box.fill(text)
  await box.press('Enter')
  await d.waitForFunction((n) => document.querySelectorAll('[data-testid="assistant-message"]').length > n, before, { timeout: 20000 })
  await d.waitForTimeout(800)
}
await ask('Please add ACT-005 to my tracker')
await d.getByTestId('approval-card').last().waitFor()
await shot(d, 'desktop-assistant-approval', false)
await d.getByTestId('approval-card').last().getByRole('button', { name: 'Approve' }).click()
await d.locator('[data-testid="approval-card"][data-status="Approved"]').last().waitFor()
await shot(d, 'desktop-assistant-approved', false)
await ask('What should I do now?')
await d.getByTestId('action-card').first().waitFor()
await shot(d, 'desktop-assistant-actions', false)
await ask('Please remember my supplier confirmed stock arrives Friday')
await visit(d, '/settings', 'Settings')
await d.getByTestId('memory-list').waitFor()
await shot(d, 'desktop-settings-memory')

// Phone
const m = await open({ width: 412, height: 915 })
for (const [name, path, heading] of [
  ['tracker', '/actions', 'Action Tracker'],
  ['review', '/review', 'Business Review'],
  ['recommendations', '/recommendations', 'AI Recommendations'],
  ['delivery', '/delivery', 'Delivery & Fulfilment'],
]) {
  await visit(m, path, heading)
  await shot(m, `phone-${name}`)
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 1) errors.push(`${path} scrolls sideways on a phone by ${overflow}px`)
}

await browser.close()
console.log(errors.length ? `Problems:\n${errors.join('\n')}` : 'No console errors, no sideways scroll')
