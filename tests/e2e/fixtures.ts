import { test as base, expect, type Page } from '@playwright/test'

/** Every test fails if the page logs a console error or throws. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      page.on('pageerror', (error) => errors.push(error.message))
      await use(errors)
      expect(errors, 'console errors during the test').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export const isPhone = (projectName: string) => projectName === 'phone'

/** Sidebar links: the fixed sidebar on desktop, the drawer on phones (opened first). */
export async function sidebar(page: Page, projectName: string) {
  if (!isPhone(projectName)) return page.locator('#sidebar')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const drawer = page.locator('#sidebar-drawer')
  await expect(drawer).toBeInViewport()
  return drawer
}

export async function openOverview(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
}
