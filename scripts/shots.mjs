// Screenshots of the key screens for visual review: node scripts/shots.mjs [baseUrl]
// Writes PNGs to ./shots (git-ignored).
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT = new URL('../shots/', import.meta.url)
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch()
const errors = []

async function page(viewport, { reducedMotion = 'reduce' } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion })
  const p = await context.newPage()
  p.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  p.on('pageerror', (error) => errors.push(error.message))
  return p
}

const shot = (p, name, fullPage = false) => p.screenshot({ path: new URL(`${name}.png`, OUT).pathname.slice(1), fullPage })

// Desktop
const desktop = await page({ width: 1440, height: 900 })
await desktop.goto(BASE)
await desktop.getByRole('heading', { level: 1, name: 'Overview' }).waitFor()
await desktop.waitForLoadState('networkidle')
await desktop.waitForTimeout(600)
await shot(desktop, 'desktop-overview')
await shot(desktop, 'desktop-overview-full', true)
await desktop.getByTestId('ai-orb').hover()
await desktop.waitForTimeout(600)
await shot(desktop, 'desktop-orb-tooltip')
await desktop.getByTestId('ai-orb').click()
await desktop.waitForTimeout(400)
await shot(desktop, 'desktop-assistant-open')
await desktop.getByRole('button', { name: 'Why have my sales declined?' }).click()
await desktop.keyboard.press('Enter')
await desktop.waitForTimeout(400)
await shot(desktop, 'desktop-assistant-message')
await desktop.getByRole('button', { name: 'Minimise assistant' }).click()
await desktop.waitForTimeout(400)
await shot(desktop, 'desktop-assistant-minimised')
await desktop.getByRole('button', { name: 'Collapse sidebar' }).click()
await desktop.getByRole('link', { name: 'Cancellations' }).click()
await desktop.waitForTimeout(400)
await shot(desktop, 'desktop-collapsed-module')
await desktop.getByRole('button', { name: /Reporting period/ }).click()
await desktop.waitForTimeout(250)
await shot(desktop, 'desktop-date-popover')
await desktop.keyboard.press('Escape')
await desktop.getByRole('button', { name: /Seller account/ }).click()
await desktop.waitForTimeout(250)
await shot(desktop, 'desktop-profile-popover')

// Milestone 2 pages
for (const [name, path] of [
  ['products', '/products'],
  ['inventory', '/inventory'],
  ['orders', '/orders'],
  ['cancellations', '/cancellations'],
  ['returns', '/returns'],
  ['analytics', '/analytics'],
  ['recommendations', '/recommendations'],
]) {
  const p = await page({ width: 1440, height: 900 })
  await p.goto(BASE + path)
  await p.getByRole('heading', { level: 1 }).waitFor()
  await p.waitForLoadState('networkidle')
  await p.waitForTimeout(500)
  await shot(p, `page-${name}`)
  await shot(p, `page-${name}-full`, true)
}

// Laptop and tablet
for (const [name, viewport] of [
  ['laptop', { width: 1280, height: 800 }],
  ['tablet', { width: 820, height: 1180 }],
]) {
  const p = await page(viewport)
  await p.goto(BASE)
  await p.getByRole('heading', { level: 1, name: 'Overview' }).waitFor()
  await p.waitForTimeout(300)
  await shot(p, `${name}-overview`)
  await shot(p, `${name}-overview-full`, true)
}

// Phone
const phone = await page({ width: 390, height: 844 })
await phone.goto(BASE)
await phone.getByRole('heading', { level: 1, name: 'Overview' }).waitFor()
await phone.waitForTimeout(300)
await shot(phone, 'phone-overview')
await shot(phone, 'phone-overview-full', true)
await phone.getByRole('button', { name: 'Open navigation' }).click()
await phone.waitForTimeout(450)
await shot(phone, 'phone-drawer')
await phone.getByRole('button', { name: 'Close navigation' }).click()
await phone.getByTestId('ai-orb').click()
await phone.waitForTimeout(400)
await shot(phone, 'phone-assistant')

await browser.close()
if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'))
  process.exitCode = 1
} else {
  console.log('Screenshots written to shots/. No console errors.')
}
