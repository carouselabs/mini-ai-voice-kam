import { expect, isPhone, openOverview, test } from './fixtures'

const metric = (key: string) => `article[data-metric="${key}"]`

test('overview shows the six summary metrics from the sample data', async ({ page }) => {
  await openOverview(page)
  await expect(page).toHaveTitle('Overview · Mini AI')

  const expected: Array<[string, string]> = [
    ['sales', '₹1,35,000'],
    ['orders', '270'],
    ['averageOrderValue', '₹500'],
    ['cancellationRate', '14%'],
    ['returnRate', '12.4%'],
    ['outOfStockProducts', '18'],
  ]
  for (const [key, value] of expected) {
    await expect(page.locator(metric(key)).getByTestId('metric-value')).toHaveText(value)
  }

  // Changes carry direction, sign and good/bad tone.
  const salesChange = page.locator(`${metric('sales')} [data-tone]`)
  await expect(salesChange).toHaveAttribute('data-tone', 'negative')
  await expect(salesChange).toContainText('−32.5%')
  await expect(page.locator(`${metric('cancellationRate')} [data-tone]`)).toContainText('+6 pts')
  await expect(page.locator(`${metric('cancellationRate')} [data-tone]`)).toHaveAttribute('data-tone', 'negative')
  await expect(page.locator(`${metric('averageOrderValue')} [data-tone]`)).toHaveAttribute('data-tone', 'neutral')

  // Provenance: assignment figures and the synthetic return rate are labelled differently.
  await expect(page.locator(`${metric('sales')} [data-testid="metric-source"]`)).toContainText('Assignment')
  await expect(page.locator(`${metric('returnRate')} [data-testid="metric-source"]`)).toContainText('Synthetic')
  await expect(page.locator(metric('sales'))).toContainText('Sep 2026 ₹2,00,000')

  await expect(page.getByTestId('data-source-note')).toContainText('Demo data as of 1 Nov 2026')
})

test('every dashboard section is present', async ({ page }) => {
  await openOverview(page)
  for (const title of [
    'Revenue performance',
    'Order performance',
    'Product performance',
    'Inventory health',
    'Order status',
    'Cancellations & returns',
    'Recent orders',
    'Business alerts & insights',
  ]) {
    await expect(page.getByRole('region', { name: title, exact: true })).toBeVisible()
  }
  // Real charts and data.
  await expect(page.locator('.recharts-surface').first()).toBeVisible()
  expect(await page.locator('.recharts-surface').count()).toBeGreaterThanOrEqual(2)
  await expect(page.getByRole('region', { name: 'Inventory health' })).toContainText('Restock on the way')
  await expect(page.getByRole('region', { name: 'Recent orders' }).locator('tbody tr')).toHaveCount(8)
  await expect(page.getByRole('region', { name: 'Business alerts & insights' })).toContainText('out-of-stock SKUs have no restock')
})

test('top bar shows the demo seller and a DEMO label', async ({ page }, testInfo) => {
  await openOverview(page)
  await expect(page.getByTestId('demo-badge')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Seller account: UrbanCart Fashion & Lifestyle' })).toBeVisible()
  if (!isPhone(testInfo.project.name)) {
    await expect(page.getByRole('banner').getByText('UrbanCart Fashion & Lifestyle', { exact: true })).toBeVisible()
  }
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Overview')
})

test('top bar menus open, explain themselves and close', async ({ page }) => {
  await openOverview(page)

  const period = page.getByRole('button', { name: /^Reporting period/ })
  await period.click()
  const periodPanel = page.getByRole('dialog', { name: 'Reporting period' })
  await expect(periodPanel).toBeVisible()
  await expect(periodPanel.getByRole('button', { name: /Last 7 days/ })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(periodPanel).toBeHidden()
  await expect(period).toBeFocused()

  await page.getByRole('button', { name: 'Notifications' }).click()
  const notifications = page.getByRole('dialog', { name: 'Notifications' })
  await expect(notifications).toContainText('No notifications yet')
  // Press an empty spot outside the panel (on phones the panel covers the page heading).
  const viewport = page.viewportSize()!
  await page.mouse.click(8, viewport.height - 160)
  await expect(notifications).toBeHidden()

  await page.getByRole('button', { name: 'Seller account: UrbanCart Fashion & Lifestyle' }).click()
  const account = page.getByRole('dialog', { name: 'Seller account' })
  await expect(account).toContainText('No real marketplace account is connected')
  await account.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(account).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
})

test('unknown pages show a way back', async ({ page }) => {
  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to Overview' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('the API answers health checks and rejects unknown routes', async ({ request }) => {
  const health = await request.get('/api/health')
  expect(health.ok()).toBe(true)
  expect(await health.json()).toMatchObject({ status: 'ok', mode: 'demo' })

  const missing = await request.get('/api/nothing-here')
  expect(missing.status()).toBe(404)
  expect(await missing.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } })
})

test('a failed request shows an error and recovers on retry', async ({ page, consoleErrors }) => {
  let fail = true
  await page.route('**/api/seller/overview', (route) =>
    fail ? route.fulfill({ status: 500, json: { error: { code: 'internal_error', message: 'Something went wrong' } } }) : route.fallback(),
  )
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Couldn’t load this data')
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('article[data-metric="sales"] [data-testid="metric-value"]')).toHaveText('₹1,35,000')
  // The browser logs the simulated 500; that one is expected. Anything else still fails the test.
  const unexpected = consoleErrors.filter((e) => !e.includes('status of 500'))
  consoleErrors.splice(0, consoleErrors.length, ...unexpected)
})
