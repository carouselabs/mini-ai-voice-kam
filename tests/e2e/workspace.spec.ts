/**
 * Milestone 4: the completed pages, the recommendation → tracker → completion flow, seller approval
 * of anything Mini AI proposes, and the seller's memory. Desktop and phone share one server, so each
 * test uses its own recommendation, text or title per project.
 */
import type { Page } from '@playwright/test'
import { expect, isPhone, test } from './fixtures'

const pick = (projectName: string, desktop: string, phone: string) => (isPhone(projectName) ? phone : desktop)

/** Mute speech so the assistant tests do not depend on the browser's voices. */
async function muted(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem('mini-ai.voice-muted', 'true'))
}

async function heading(page: Page, path: string, name: string) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

async function ask(page: Page, text: string, index: number) {
  const panel = page.getByTestId('assistant-panel')
  const input = panel.getByRole('textbox', { name: 'Message your Virtual KAM' })
  await input.fill(text)
  await input.press('Enter')
  const answer = panel.getByTestId('assistant-message').nth(index)
  await expect(answer).toContainText('[Test model]')
  return answer
}

async function openAssistant(page: Page) {
  await muted(page)
  await heading(page, '/', 'Overview')
  await page.getByTestId('ai-orb').click()
  await expect(page.getByTestId('assistant-panel').getByTestId('assistant-message').first()).toContainText('Sales are down 32.5% this month')
}

test('the completed pages show real data or say plainly what is not available', async ({ page }) => {
  test.slow()
  await heading(page, '/delivery', 'Delivery & Fulfilment')
  await expect(page.locator('[data-stat="On-time delivery"]')).toContainText('94.3%')
  await expect(page.getByText('12 of 12 late deliveries were dispatched more than 48 hours after the order.')).toBeVisible()

  await heading(page, '/payments', 'Payments & Settlements')
  await expect(page.locator('[data-stat="Order value collected"]')).toBeVisible()
  await expect(page.getByTestId('unavailable').filter({ hasText: 'Settlements' })).toContainText('Not in this demo dataset')

  await heading(page, '/promotions', 'Promotions')
  await expect(page.getByTestId('promotion-candidates')).toContainText('Women’s Canvas Sneakers')
  await expect(page.getByTestId('promotion-hold')).toContainText('Some sizes or colours out of stock')

  await heading(page, '/reviews', 'Ratings & Reviews')
  await expect(page.getByTestId('reviews-by-product')).toBeVisible()
  await expect(page.getByText(/Review text is synthetic/)).toBeVisible()

  await heading(page, '/profile', 'Seller profile')
  await expect(page.getByRole('heading', { level: 2, name: 'UrbanCart Fashion & Lifestyle' })).toBeVisible()

  await heading(page, '/help', 'Help & Support')
  await expect(page.getByText('What can Mini AI write?')).toBeVisible()

  for (const path of ['/delivery', '/payments', '/promotions', '/reviews', '/review', '/actions', '/settings', '/help', '/profile']) {
    await page.goto(path)
    await expect(page.getByText('Coming soon')).toHaveCount(0)
  }
})

test('business review: health, risks, opportunities, three actions and structured investigations', async ({ page }) => {
  await heading(page, '/review', 'Business Review')
  // The review is the heaviest page; on a busy machine its data can take over 5 s to arrive.
  await expect(page.getByTestId('review-risks')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('review-risks').locator(':scope > li')).toHaveCount(5)
  const opportunities = page.getByTestId('review-opportunities')
  await expect(opportunities).toContainText('Supported')
  await expect(opportunities).toContainText('Hypothesis')
  await expect(page.getByTestId('review-plan').locator(':scope > li')).toHaveCount(3)
  const finding = page.locator('[data-finding="FIND-SD-04"]')
  await finding.getByRole('button').click()
  await expect(finding).toContainText('Verified in the records')
  await expect(finding).toContainText('Supported explanations (seen alongside, not proven causes)')
  await expect(finding).toContainText('Hypotheses (not confirmed by the data)')
  await expect(finding).toContainText('Next to investigate')
})

test('the same figures are shown on every page and by every API', async ({ page }) => {
  // The six headline cards on Overview and on Business Review come from one calculation.
  const cards = async () => {
    await expect(page.locator('[data-metric] [data-testid="metric-value"]')).toHaveCount(6)
    return Object.fromEntries(
      await page.locator('[data-metric]').evaluateAll((els) =>
        els.map((el) => [el.getAttribute('data-metric'), el.querySelector('[data-testid="metric-value"]')?.textContent?.trim()]),
      ),
    )
  }
  await heading(page, '/', 'Overview')
  const overview = await cards()
  await heading(page, '/review', 'Business Review')
  const review = await cards()
  expect(Object.keys(overview)).toHaveLength(6)
  expect(review).toEqual(overview)
  expect(overview.sales).toBe('₹1,35,000')
  expect(overview.orders).toBe('270')

  // Delivery on its own page and in the review.
  await expect(page.getByText('94.3%').first()).toBeVisible()
  await heading(page, '/delivery', 'Delivery & Fulfilment')
  await expect(page.locator('[data-stat="On-time delivery"]')).toContainText('94.3%')

  // The APIs agree with each other.
  const api = async (path: string) => (await (await page.request.get(path)).json()).data
  const [sellerOverview, reviewData, revenue] = await Promise.all([api('/api/seller/overview'), api('/api/review'), api('/api/analytics/revenue')])
  expect(reviewData.health.kpis).toEqual(sellerOverview.kpis)
  expect(revenue.records.sales.current).toBe(135000)
})

test('a recommendation goes to the tracker, is approved, worked on and completed', async ({ page }, testInfo) => {
  const id = pick(testInfo.project.name, 'ACT-003', 'ACT-004')
  await heading(page, '/recommendations', 'AI Recommendations')
  const card = page.locator(`[data-action="${id}"]`)
  const title = (await card.getByRole('heading', { level: 2 }).textContent()) ?? ''
  await card.getByRole('button', { name: 'Add to tracker' }).click()
  const dialog = page.getByTestId('add-to-tracker')
  await expect(dialog).toContainText('Then watch:')
  await dialog.getByRole('button', { name: 'Add, approve later' }).click()
  await expect(card).toHaveAttribute('data-state', 'awaiting_approval')
  await expect(card.getByTestId('recommendation-state')).toHaveText('Awaiting Approval')

  await card.getByRole('link', { name: 'Open in tracker' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Action Tracker' })).toBeVisible()
  const row = page.locator('[data-tracker]').filter({ hasText: title })
  await expect(row).toHaveAttribute('data-status', 'Awaiting Approval')
  await expect(row).toContainText('Added by you')

  await row.getByRole('button', { name: 'Approve' }).click()
  await expect(row).toHaveAttribute('data-status', 'Approved')
  await row.getByRole('combobox', { name: /Status of/ }).selectOption('In Progress')
  await expect(row).toHaveAttribute('data-status', 'In Progress')

  await row.getByRole('button', { name: 'Details' }).click()
  await row.getByRole('textbox', { name: 'Add a note' }).fill('Raised the purchase order today.')
  await row.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(row).toContainText('Raised the purchase order today.')
  await expect(row).toContainText('Approved → In Progress')

  await row.getByRole('combobox', { name: /Status of/ }).selectOption('Completed')
  await expect(row).toHaveAttribute('data-status', 'Completed')
  await expect(row).toContainText(/Completed \d{1,2} \w{3} \d{4}/)

  // Completed recommendations leave the open list.
  await heading(page, '/recommendations', 'AI Recommendations')
  await expect(page.locator(`[data-action="${id}"]`)).toHaveCount(0)
  await page.getByRole('button', { name: 'Completed & rejected' }).click()
  await expect(page.locator(`[data-action="${id}"]`)).toHaveAttribute('data-state', 'completed')
})

test('rejecting a recommendation records why, and it can be restored', async ({ page }, testInfo) => {
  const id = pick(testInfo.project.name, 'ACT-012', 'ACT-013')
  await heading(page, '/recommendations', 'AI Recommendations')
  await page.locator(`[data-action="${id}"]`).getByRole('button', { name: 'Reject' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').fill('Not this month')
  await dialog.getByRole('button', { name: 'Reject' }).click()
  await expect(page.locator(`[data-action="${id}"]`)).toHaveCount(0)

  await page.getByRole('button', { name: 'Completed & rejected' }).click()
  const card = page.locator(`[data-action="${id}"]`)
  await expect(card).toContainText('You rejected this: Not this month')
  await card.getByRole('button', { name: 'Restore' }).click()
  await expect(card).toHaveCount(0)
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.locator(`[data-action="${id}"]`)).toHaveAttribute('data-state', 'proposed')
})

test('Mini AI can only propose a tracker entry; the seller approves it', async ({ page }, testInfo) => {
  const id = pick(testInfo.project.name, 'ACT-008', 'ACT-009')
  await openAssistant(page)
  const answer = await ask(page, `Please add ${id} to my tracker`, 1)
  await expect(answer).toContainText('awaiting your approval')
  await expect(answer).toContainText('Checked: Adding it to your tracker for approval')
  const card = answer.getByTestId('approval-card')
  await expect(card).toHaveAttribute('data-status', 'Awaiting Approval')
  await expect(card).toContainText('only you can approve it')

  // Nothing is approved until the seller presses the button.
  const before = await (await page.request.get('/api/tracker')).json()
  const saved = before.data.actions.find((a: { recommendationId: string }) => a.recommendationId === id)
  expect(saved.status).toBe('Awaiting Approval')
  expect(saved.createdBy).toBe('mini-ai')
  expect(saved.approvedAt).toBeNull()

  await card.getByRole('button', { name: 'Approve' }).click()
  await expect(card).toHaveAttribute('data-status', 'Approved')
  const after = await (await page.request.get('/api/tracker')).json()
  expect(after.data.actions.find((a: { id: string }) => a.id === saved.id).status).toBe('Approved')
})

test('recommendations in an answer are separate from findings and can be added from the panel', async ({ page }) => {
  await openAssistant(page)
  const answer = await ask(page, 'What should I do now?', 1)
  await expect(answer).toContainText('What you could do')
  await expect(answer.getByTestId('action-card').first()).toContainText('Then watch:')
})

test('what the seller says is remembered, shown as unverified, and can be deleted', async ({ page }, testInfo) => {
  const note = pick(testInfo.project.name, 'my courier pickup moved to 4 pm', 'my warehouse is closed on Sunday')
  await openAssistant(page)
  const answer = await ask(page, `Please remember ${note}`, 1)
  await expect(answer).toContainText(`Noted: Seller says: ${note}`)

  await heading(page, '/settings', 'Settings')
  const item = page.locator('[data-memory]').filter({ hasText: note })
  await expect(item).toContainText('Not verified by the data')
  await item.getByRole('button', { name: /^Delete/ }).click()
  await expect(item).toHaveCount(0)
})

test('the seller can add an action of their own', async ({ page }, testInfo) => {
  const title = `Check packaging stock (${testInfo.project.name})`
  await heading(page, '/actions', 'Action Tracker')
  await page.getByRole('button', { name: 'New action' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'What needs doing' }).fill(title)
  await dialog.getByRole('button', { name: 'Add approved action' }).click()
  const row = page.locator('[data-tracker]').filter({ hasText: title })
  await expect(row).toHaveAttribute('data-status', 'Approved')
  await expect(row).toContainText('Added by you')
})
