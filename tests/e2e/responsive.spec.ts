import { expect, isPhone, test } from './fixtures'

const WIDTHS = [360, 768, 1024, 1440, 1920]

test('no page scrolls sideways at common widths', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo.project.name), 'widths are set explicitly')
  test.setTimeout(240_000)
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/', '/products', '/orders', '/cancellations', '/analytics']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0)
    }
  }
})

test('the assistant panel fits small screens', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo.project.name), 'sizes are set explicitly')
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.getByTestId('ai-orb').click()
    const panel = page.getByTestId('assistant-panel')
    await expect(panel).toHaveAttribute('data-state', 'open')
    await panel.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))
    await expect(panel).toBeInViewport({ ratio: 1 })
    const orb = await page.getByTestId('ai-orb').boundingBox()
    const box = await panel.boundingBox()
    expect(box && orb && box.y + box.height <= orb.y, `panel sits above the orb at ${viewport.width}px`).toBe(true)
    await expect(page.getByRole('textbox', { name: 'Message your Virtual KAM' })).toBeInViewport()
  }
})

test('product and order tables scroll inside their cards on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const table = page.getByRole('table', { name: /Product performance/ })
  await expect(table).toBeVisible()
  const scroller = table.locator('xpath=..')
  const canScroll = await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)
  expect(canScroll).toBe(true)
})
