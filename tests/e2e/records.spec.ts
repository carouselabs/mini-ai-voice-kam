import { expect, test } from './fixtures'

test.describe('records pages', () => {
  test('products: search, filter and sort', async ({ page }) => {
    await page.goto('/products')
    const table = page.getByRole('table', { name: 'Products' })
    await expect(table.locator('tbody tr')).toHaveCount(20)

    // Sorted by revenue, highest first.
    await expect(table.getByRole('columnheader', { name: /Revenue/ })).toHaveAttribute('aria-sort', 'descending')
    await table.getByRole('button', { name: /Revenue/ }).click()
    await expect(table.getByRole('columnheader', { name: /Revenue/ })).toHaveAttribute('aria-sort', 'ascending')

    await page.getByRole('searchbox', { name: 'Search products or SKUs' }).fill('earbuds')
    await expect(table.locator('tbody tr')).toHaveCount(1)
    await expect(table).toContainText('Wireless Bluetooth Earbuds')

    await page.getByRole('searchbox', { name: 'Search products or SKUs' }).fill('')
    await page.getByLabel('Categories').selectOption('Electronics')
    await expect(table.locator('tbody tr')).toHaveCount(6)
  })

  test('inventory: status filter and stock cover', async ({ page }) => {
    await page.goto('/inventory')
    const table = page.getByRole('table', { name: 'Inventory' })
    await expect(table.locator('tbody tr').first()).toBeVisible()
    await page.getByLabel('Statuses').selectOption('Out of Stock')
    await expect(page.getByText('13 of 43')).toBeVisible()
    await page.getByLabel('Statuses').selectOption('Critical')
    await expect(table).toContainText('Stainless Steel Water Bottle 1 L')
  })

  test('orders: period switch, filters and pages', async ({ page }) => {
    await page.goto('/orders')
    await expect(page.getByRole('region', { name: 'October 2026 orders' })).toContainText('270 orders')
    const table = page.getByRole('table', { name: 'Orders' })
    await expect(table.locator('tbody tr')).toHaveCount(20)

    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.getByText('21–40 of 270')).toBeVisible()

    await page.getByLabel('Order statuses').selectOption('Cancelled')
    await expect(page.getByText('38 of 270')).toBeVisible()

    await page.getByRole('button', { name: 'Sep 2026', exact: true }).click()
    await expect(page.getByRole('region', { name: 'September 2026 orders' })).toContainText('400 orders')
  })

  test('cancellations: reasons chart and records', async ({ page }) => {
    await page.goto('/cancellations')
    await expect(page.getByRole('region', { name: 'Cancellation reasons' }).locator('.recharts-surface')).toBeVisible()
    await expect(page.getByRole('region', { name: 'October 2026 cancellations' })).toContainText('38 cancelled orders')
    await page.getByLabel('Reasons', { exact: true }).selectOption('Inventory Unavailable')
    await expect(page.getByText('11 of 38')).toBeVisible()
  })

  test('returns: reasons, products and records', async ({ page }) => {
    await page.goto('/returns')
    await expect(page.getByRole('region', { name: 'Most-returned products' })).toContainText('Wireless Bluetooth Earbuds')
    await expect(page.getByRole('region', { name: 'October 2026 returns' })).toContainText('26 returns')
  })

  test('chart data is available as a table', async ({ page }) => {
    await page.goto('/cancellations')
    await page.getByRole('button', { name: 'View as table' }).first().click()
    // The button renames itself once the table is open.
    await expect(page.getByRole('button', { name: 'Hide table' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('cell', { name: 'Inventory Unavailable' }).first()).toBeVisible()
  })

  test('business analytics', async ({ page }) => {
    await page.goto('/analytics')
    for (const title of ['Sales by category', 'Delivery issues', 'Estimated gross profit by product', 'Pricing']) {
      await expect(page.getByRole('region', { name: title, exact: true })).toBeVisible()
    }
    await expect(page.getByText('not net profit')).toBeVisible()
  })

  test('recommendations are proposals with evidence', async ({ page }) => {
    await page.goto('/recommendations')
    // Other tests add, complete and reject recommendations on the same server, so count loosely.
    const cards = page.locator('article[data-action]')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThanOrEqual(10)
    const card = page.locator('article[data-action="ACT-001"]')
    await expect(card.getByTestId('recommendation-state')).toHaveText('Proposed')
    await expect(card).toContainText('Evidence')
    await expect(card).toContainText('Metric to monitor')
    await expect(card).toContainText('How to verify')
    await card.getByRole('button', { name: /^Ask Mini AI about/ }).click()
    await expect(page.getByRole('textbox', { name: 'Message your Virtual KAM' })).toHaveValue(/Tell me more about this recommendation/)
  })
})
