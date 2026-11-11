/**
 * Assistant tests. The server runs the scripted MOCK model (AI_PROVIDER=mock): tool calls, data,
 * sessions and streaming are real; replies are labelled "[Test model]". Browser speech is replaced
 * by scripted fakes so the voice loop can run without a microphone.
 */
import type { Page } from '@playwright/test'
import { expect, isPhone, openOverview, test } from './fixtures'

/** Scripted speech: recognition hears `window.__voice.say`; synthesis records what it would say. */
async function fakeSpeech(page: Page, { supported = true, micDenied = false } = {}) {
  await page.addInitScript(
    ({ supported, micDenied }) => {
      const state = { spoken: [] as string[], cancelled: 0, say: 'Customers are cancelling unnecessarily', holdSpeech: false }
      ;(window as unknown as { __voice: typeof state }).__voice = state
      const w = window as unknown as Record<string, unknown>
      if (supported) {
        class FakeRecognition {
          lang = ''
          onstart?: () => void
          onresult?: (e: unknown) => void
          onend?: () => void
          onerror?: (e: unknown) => void
          start() {
            const result = (text: string, isFinal: boolean) => ({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal })] })
            setTimeout(() => this.onstart?.(), 30)
            setTimeout(() => this.onresult?.(result(state.say.split(' ').slice(0, 2).join(' '), false)), 400)
            setTimeout(() => this.onresult?.(result(state.say, true)), 2400)
            setTimeout(() => this.onend?.(), 2500)
          }
          stop() {}
          abort() {}
        }
        w.SpeechRecognition = FakeRecognition
        w.webkitSpeechRecognition = FakeRecognition
      } else {
        delete w.SpeechRecognition
        delete w.webkitSpeechRecognition
      }
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            if (micDenied) throw new DOMException('denied', 'NotAllowedError')
            return { getTracks: () => [{ stop() {} }] }
          },
        },
      })
      w.SpeechSynthesisUtterance = class {
        text: string
        onstart?: () => void
        onend?: () => void
        constructor(text: string) {
          this.text = text
        }
      }
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          getVoices: () => [],
          cancel: () => state.cancelled++,
          speak: (u: { text: string; onstart?: () => void; onend?: () => void }) => {
            state.spoken.push(u.text)
            setTimeout(() => u.onstart?.(), 10)
            if (!state.holdSpeech) setTimeout(() => u.onend?.(), 40)
          },
        },
      })
    },
    { supported, micDenied },
  )
}

const voiceState = (page: Page) =>
  page.evaluate(() => (window as unknown as { __voice: { spoken: string[]; cancelled: number } }).__voice)

async function openAndGreet(page: Page) {
  await openOverview(page)
  await page.getByTestId('ai-orb').click()
  const panel = page.getByTestId('assistant-panel')
  await expect(panel).toHaveAttribute('data-state', 'open')
  // At the start of a full run two browsers launch at once and the machine is saturated; the server greets in
  // milliseconds, but the first responses can take 6–8 s to reach the page (seen in traces).
  // The greeting is built from the verified figures (no model call), so it carries the real decline figure.
  await expect(panel.getByTestId('assistant-message').first()).toContainText('Sales are down 32.5% this month', { timeout: 15_000 })
  return panel
}

test('opening the assistant inspects the account first and greets with real evidence', async ({ page }) => {
  await fakeSpeech(page)
  const panel = await openAndGreet(page)
  const greeting = panel.getByTestId('assistant-message').first()
  await expect(greeting).toContainText('Checked: Reviewing your account overview · Checking overall account health')
  await expect(panel.getByText('Test model', { exact: true })).toBeVisible()
  await greeting.getByRole('button', { name: /Show findings/ }).click()
  const card = greeting.getByTestId('evidence-card').first()
  await expect(card).toContainText('as of 1 Nov 2026')
  await expect(card).toContainText('confidence')
  // The greeting is spoken.
  expect((await voiceState(page)).spoken.join(' ')).toContain('Sales are down 32.5% this month')
})

test('a typed question runs real data checks and links to the dashboard', async ({ page }) => {
  await fakeSpeech(page)
  const panel = await openAndGreet(page)
  const input = panel.getByRole('textbox', { name: 'Message your Virtual KAM' })
  await input.fill('My sales have dropped. What is happening?')
  await input.press('Enter')
  await expect(panel.getByRole('log')).toContainText('My sales have dropped')
  const answer = panel.getByTestId('assistant-message').nth(1)
  await expect(answer).toContainText('Checked: Investigating the sales decline')
  await answer.getByRole('button', { name: /Show findings/ }).click()
  const card = answer.locator('[data-finding^="FIND-SD"]').first()
  await expect(card).toBeVisible()
  await card.getByRole('link').click()
  await expect(panel).toHaveAttribute('data-state', 'closed')
  await expect(page.getByTestId('assistant-minimised')).toBeVisible()
})

test('voice: speak, see the transcript, hear the answer, interrupt', async ({ page }) => {
  await fakeSpeech(page)
  const panel = await openAndGreet(page)
  await expect(panel.getByTestId('assistant-status')).toHaveText('Ready')

  await panel.getByTestId('mic-button').click()
  // Generous: under the full parallel suite the fake recogniser's first result can take over 5 s to render.
  await expect(panel.getByTestId('live-transcript')).toContainText('Customers are', { timeout: 10_000 })
  await expect(page.getByTestId('ai-orb')).toHaveAttribute('data-voice', 'listening')
  await expect(panel.getByRole('log')).toContainText('You (spoken): Customers are cancelling unnecessarily')
  const answer = panel.getByTestId('assistant-message').nth(1)
  await expect(answer).toContainText('Checked: Investigating cancellations')
  await expect.poll(async () => (await voiceState(page)).spoken.length).toBeGreaterThan(1)
  await expect(panel.getByTestId('assistant-status')).toHaveText('Ready')

  // Hold the next answer "on air" and interrupt it.
  await page.evaluate(() => ((window as unknown as { __voice: { holdSpeech: boolean } }).__voice.holdSpeech = true))
  const input = panel.getByRole('textbox', { name: 'Message your Virtual KAM' })
  await input.fill('What about returns?')
  await input.press('Enter')
  await expect(panel.getByTestId('assistant-status')).toHaveText('Speaking')
  const cancelledBefore = (await voiceState(page)).cancelled
  await panel.getByRole('button', { name: 'Stop speaking' }).click()
  expect((await voiceState(page)).cancelled).toBeGreaterThan(cancelledBefore)
  await expect(panel.getByTestId('assistant-status')).toHaveText(/Stopped|Ready/)
})

test('muting stops spoken replies', async ({ page }) => {
  await fakeSpeech(page)
  const panel = await openAndGreet(page)
  await panel.getByRole('button', { name: 'Mute spoken replies' }).click()
  const spokenBefore = (await voiceState(page)).spoken.length
  const input = panel.getByRole('textbox', { name: 'Message your Virtual KAM' })
  await input.fill('Which products should I restock?')
  await input.press('Enter')
  await expect(panel.getByTestId('assistant-message').nth(1)).toContainText('[Test model]')
  expect((await voiceState(page)).spoken.length).toBe(spokenBefore)
  await expect(panel.getByRole('button', { name: 'Turn on spoken replies' })).toHaveAttribute('aria-pressed', 'true')
})

test('without speech recognition the assistant explains and text still works', async ({ page }) => {
  await fakeSpeech(page, { supported: false })
  const panel = await openAndGreet(page)
  await expect(panel.getByTestId('mic-button')).toBeDisabled()
  await expect(panel.getByTestId('voice-hint')).toContainText('Voice input needs Chrome or Edge')
  const input = panel.getByRole('textbox', { name: 'Message your Virtual KAM' })
  await input.fill('Did my supplier confirm the delivery date today?')
  await input.press('Enter')
  await expect(panel.getByTestId('assistant-message').nth(1)).toContainText('cannot see supplier confirmations')
})

test('a blocked microphone is explained with a way to retry', async ({ page }) => {
  await fakeSpeech(page, { micDenied: true })
  const panel = await openAndGreet(page)
  await panel.getByTestId('mic-button').click()
  await expect(panel.getByTestId('voice-hint')).toContainText('Microphone access is blocked')
  await expect(panel.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(panel.getByTestId('assistant-status')).toHaveText('Voice problem')
})

test('minimise keeps the conversation; ending it starts fresh', async ({ page }) => {
  await fakeSpeech(page)
  const panel = await openAndGreet(page)
  const input = panel.getByRole('textbox', { name: 'Message your Virtual KAM' })
  await input.fill('Why are cancellations increasing?')
  await input.press('Enter')
  await expect(panel.getByTestId('assistant-message').nth(1)).toBeVisible()

  await input.press('Escape')
  await expect(panel).toHaveAttribute('data-state', 'closed')
  await expect(page.getByTestId('assistant-minimised')).toContainText('1 question asked')
  await page.getByRole('button', { name: /Restore assistant/ }).click()
  await expect(panel.getByRole('log')).toContainText('Why are cancellations increasing?')

  await panel.getByRole('button', { name: 'End conversation' }).click()
  await expect(panel).toHaveAttribute('data-state', 'closed')
  await page.getByTestId('ai-orb').click()
  await expect(panel.getByTestId('assistant-message')).toHaveCount(1)
  await expect(panel.getByRole('log')).not.toContainText('Why are cancellations increasing?')
})

test('Ask your Virtual KAM buttons open the assistant with the question ready', async ({ page }) => {
  test.slow()
  await fakeSpeech(page)
  await page.goto('/delivery')
  await page.getByRole('button', { name: 'Ask about delivery' }).click()
  await expect(page.getByTestId('assistant-panel')).toHaveAttribute('data-state', 'open')
  await expect(page.getByRole('textbox', { name: 'Message your Virtual KAM' })).toHaveValue('Is there a delivery or dispatch problem?')
})

test('the hidden panel cannot be reached by keyboard and the orb tooltip works', async ({ page }, testInfo) => {
  await fakeSpeech(page)
  await openOverview(page)
  const panel = page.getByTestId('assistant-panel')
  await expect(panel).toHaveAttribute('inert', '')
  if (!isPhone(testInfo.project.name)) {
    await page.getByTestId('ai-orb').hover()
    await expect(page.locator('[data-tooltip]')).toHaveText('Talk to your Virtual KAM')
  }
  await page.getByTestId('ai-orb').click()
  await expect(panel).not.toHaveAttribute('inert', '')
})

test('the orb stops moving when reduced motion is requested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openOverview(page)
  await expect(page.locator('[data-testid="ai-orb"] animateMotion')).toHaveCount(1)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('[data-testid="ai-orb"] animateMotion')).toHaveCount(0)
})
