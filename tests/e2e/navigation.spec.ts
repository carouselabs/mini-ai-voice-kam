import { expect, isPhone, openOverview, sidebar, test } from './fixtures'

const PAGES: Array<[label: string, path: string]> = [
  ['Products', '/products'],
  ['Orders', '/orders'],
  ['Inventory', '/inventory'],
  ['Cancellations', '/cancellations'],
  ['Returns & Refunds', '/returns'],
  ['Delivery & Fulfilment', '/delivery'],
  ['Payments & Settlements', '/payments'],
  ['Promotions', '/promotions'],
  ['Ratings & Reviews', '/reviews'],
  ['Business Analytics', '/analytics'],
  ['Business Review', '/review'],
  ['AI Recommendations', '/recommendations'],
  ['Action Tracker', '/actions'],
  ['Settings', '/settings'],
  ['Help & Support', '/help'],
  ['Overview', '/'],
]

test('every sidebar link opens its page and becomes the active item', async ({ page }, testInfo) => {
  test.slow()
  await openOverview(page)

  for (const [label, path] of PAGES) {
    const nav = await sidebar(page, testInfo.project.name)
    await nav.getByRole('link', { name: label, exact: true }).click()

    await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/' : path}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page).toHaveTitle(`${label} · Mini AI`)
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="page"]')).toHaveText(label)

    // The drawer closes after choosing a page on phones.
    if (isPhone(testInfo.project.name)) await expect(page.locator('#sidebar-drawer')).not.toBeInViewport()

    const activeNav = isPhone(testInfo.project.name) ? page.locator('#sidebar-drawer') : page.locator('#sidebar')
    await expect(activeNav.locator('a[aria-current="page"]')).toHaveCount(1)
    await expect(activeNav.locator('a[aria-current="page"]')).toContainText(label)
  }
})

test('the seller card opens the seller profile', async ({ page }, testInfo) => {
  await openOverview(page)
  const nav = await sidebar(page, testInfo.project.name)
  await nav.getByRole('link', { name: /Seller profile: UrbanCart Fashion & Lifestyle/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Seller profile' })).toBeVisible()
})

test('desktop sidebar collapses to an icon rail and remembers it', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo.project.name), 'desktop only')
  await openOverview(page)
  const aside = page.locator('#sidebar')
  await expect(aside).toHaveAttribute('data-collapsed', 'false')

  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect(aside).toHaveAttribute('data-collapsed', 'true')
  await expect.poll(async () => (await aside.boundingBox())?.width).toBe(72)

  // Labels stay available to assistive tech and as tooltips.
  const orders = aside.getByRole('link', { name: 'Orders', exact: true })
  await orders.hover()
  await expect(page.locator('[data-tooltip]')).toHaveText('Orders')
  await orders.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible()

  await page.reload()
  await expect(aside).toHaveAttribute('data-collapsed', 'true')
  await page.getByRole('button', { name: 'Expand sidebar' }).click()
  await expect(aside).toHaveAttribute('data-collapsed', 'false')
})

test('phone drawer opens, closes with Escape and returns focus', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'phone only')
  await openOverview(page)
  const toggle = page.getByRole('button', { name: 'Open navigation' })
  await toggle.click()
  await expect(page.locator('#sidebar-drawer')).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Close navigation' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(page.locator('#sidebar-drawer')).not.toBeInViewport()
  await expect(toggle).toBeFocused()
})

test('keyboard users can skip to the main content', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo.project.name), 'keyboard check on desktop')
  await openOverview(page)
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
})
