/**
 * Live voice UI with a scripted fake in place of OpenAI (MOCKED transport; the Mini AI server, its session route and
 * tool relay are real). Live API behaviour: npm run voice:eval. Real microphone: npm run voice:live.
 */
import type { Page } from '@playwright/test'
import { expect, openOverview, test } from './fixtures'

type FakeOptions = { micDenied?: boolean }

/** Installs a fake Realtime connection and microphone. window.__rt.emit(event) plays a server event. */
async function fakeRealtime(page: Page, { micDenied = false }: FakeOptions = {}) {
  await page.addInitScript(
    ({ micDenied }) => {
      type Ev = Record<string, unknown>
      const rt = {
        sent: [] as Ev[],
        connects: 0,
        closed: 0,
        handler: (_e: Ev) => {},
        drop: (_r: 'failed' | 'disconnected') => {},
        emit(e: Ev) {
          rt.handler(e)
        },
      }
      ;(window as unknown as { __rt: typeof rt }).__rt = rt
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            if (micDenied) throw new DOMException('denied', 'NotAllowedError')
            return new AudioContext().createMediaStreamDestination().stream
          },
        },
      })
      ;(window as unknown as { __miniAiFakeRealtime: unknown }).__miniAiFakeRealtime = async () => {
        rt.connects++
        return {
          send: (e: Ev) => rt.sent.push(e),
          close: () => rt.closed++,
          remoteStream: null,
          onEvent: (h: (e: Ev) => void) => (rt.handler = h),
          onDrop: (h: (r: 'failed' | 'disconnected') => void) => (rt.drop = h),
        }
      }
    },
    { micDenied },
  )
}

const emit = (page: Page, event: Record<string, unknown>) => page.evaluate((e) => (window as unknown as { __rt: { emit: (x: unknown) => void } }).__rt.emit(e), event)
const sent = (page: Page) => page.evaluate(() => (window as unknown as { __rt: { sent: Array<Record<string, unknown>> } }).__rt.sent)
const rt = (page: Page) => page.evaluate(() => (window as unknown as { __rt: { connects: number; closed: number } }).__rt)

async function openLive(page: Page) {
  await openOverview(page)
  await page.getByTestId('ai-orb').click()
  const panel = page.getByTestId('assistant-panel')
  await expect(panel.getByTestId('assistant-message').first()).toContainText('Sales are down 32.5% this month', { timeout: 15_000 })
  await panel.getByTestId('live-voice-button').click()
  await expect(panel).toHaveAttribute('data-mode', 'live')
  return panel
}

test('a live call: greeting, a data check with evidence, stop speaking, mute, language, typing, end', async ({ page }) => {
  test.slow()
  await fakeRealtime(page)
  const toolCalls: string[] = []
  page.on('request', (r) => r.url().endsWith('/api/realtime/tool') && toolCalls.push(r.postData() ?? ''))
  const panel = await openLive(page)
  const live = panel.getByTestId('live-voice')
  await live.getByRole('button', { name: 'Start live voice' }).click()

  // Greeting is requested once the call opens.
  await expect.poll(async () => (await sent(page)).filter((e) => e.type === 'response.create').length).toBe(1)
  const greeting = (await sent(page)).find((e) => e.type === 'conversation.item.create') as { item: { role: string; content: Array<{ text: string }> } }
  expect(greeting.item.role).toBe('system')
  expect(greeting.item.content[0].text).toMatch(/Greet them/)

  // The seller speaks.
  await emit(page, { type: 'input_audio_buffer.speech_started' })
  await expect(live.getByTestId('live-status')).toHaveText('Hearing you…')
  await emit(page, { type: 'input_audio_buffer.speech_stopped' })
  await expect(live.getByTestId('live-status')).toHaveText('Thinking…')
  await emit(page, { type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Why did my sales drop?' })
  await expect(live.getByTestId('live-line-seller')).toContainText('Why did my sales drop?')

  // The model asks for a data tool; the real server relay runs it and the evidence shows.
  await emit(page, { type: 'response.created' })
  await emit(page, { type: 'response.done', response: { status: 'completed', output: [{ type: 'function_call', call_id: 'c1', name: 'investigateSalesDecline', arguments: '{}' }] } })
  await expect(live.getByTestId('live-tool')).toHaveAttribute('data-status', 'done')
  await expect(live.getByTestId('evidence-card').first()).toBeVisible()
  await expect.poll(async () => (await sent(page)).some((e) => e.type === 'conversation.item.create' && (e.item as { type: string; call_id: string }).call_id === 'c1')).toBe(true)
  const responsesAfterTool = (await sent(page)).filter((e) => e.type === 'response.create').length
  expect(responsesAfterTool).toBe(2)

  // A duplicated event never runs the tool twice or asks for a second answer.
  await emit(page, { type: 'response.done', response: { status: 'completed', output: [{ type: 'function_call', call_id: 'c1', name: 'investigateSalesDecline', arguments: '{}' }] } })
  await page.waitForTimeout(300)
  expect(toolCalls.length).toBe(1)
  expect((await sent(page)).filter((e) => e.type === 'response.create').length).toBe(2)

  // The spoken answer streams in; Stop speaking cancels it.
  await emit(page, { type: 'response.output_audio_transcript.delta', item_id: 'a1', delta: 'Sales fell 32.5 percent' })
  await emit(page, { type: 'output_audio_buffer.started' })
  await expect(live.getByTestId('live-status')).toHaveText('Speaking. Talk any time to interrupt')
  await expect(live.getByTestId('live-line-assistant').last()).toContainText('Sales fell 32.5 percent')
  await live.getByRole('button', { name: 'Stop speaking' }).click()
  expect((await sent(page)).map((e) => e.type)).toEqual(expect.arrayContaining(['response.cancel', 'output_audio_buffer.clear']))
  await expect(live.getByTestId('live-line-assistant').last()).toContainText('(interrupted)')
  await expect(live.getByTestId('live-status')).toHaveText('Listening. Speak naturally')

  // Mute: the status says the microphone is off; it never pretends to listen.
  await live.getByRole('button', { name: 'Mute' }).click()
  await expect(live.getByTestId('live-status')).toHaveText('Microphone off')
  await live.getByRole('button', { name: 'Unmute' }).click()
  await expect(live.getByTestId('live-status')).toHaveText('Listening. Speak naturally')

  // Language change mid-call updates the session with the Hindi rules.
  await live.getByRole('group', { name: 'Reply language' }).getByRole('button', { name: 'हिन्दी' }).click()
  await expect.poll(async () => JSON.stringify((await sent(page)).filter((e) => e.type === 'session.update'))).toContain('Language: Hindi')

  // Typed fallback inside the call.
  await live.getByRole('textbox', { name: 'Type instead' }).fill('What about cancellations?')
  await live.getByRole('button', { name: 'Send' }).click()
  await expect(live.getByTestId('live-line-seller').last()).toContainText('What about cancellations?')
  expect(JSON.stringify((await sent(page)).filter((e) => e.type === 'conversation.item.create').at(-1))).toContain('What about cancellations?')

  // End: the connection closes and the call can be started again.
  await live.getByRole('button', { name: 'End call', exact: true }).click()
  await expect(live.getByTestId('live-status')).toHaveText('Call ended')
  expect((await rt(page)).closed).toBe(1)
  await expect(live.getByRole('button', { name: 'Start a new call' })).toBeVisible()
})

test('a blocked microphone is explained, with Retry', async ({ page }) => {
  await fakeRealtime(page, { micDenied: true })
  const panel = await openLive(page)
  const live = panel.getByTestId('live-voice')
  await live.getByRole('button', { name: 'Start live voice' }).click()
  await expect(live.getByTestId('live-status')).toContainText('Microphone access is blocked')
  await expect(live.getByRole('button', { name: 'Retry' })).toBeVisible()
  // The call is opened ahead of time without the microphone; with the microphone blocked nothing is ever said or
  // asked of the model.
  expect((await sent(page)).filter((e) => e.type === 'response.create' || e.type === 'conversation.item.create')).toEqual([])
})

test('the call is opened while the seller looks at the screen, so Start only switches the microphone on', async ({ page }) => {
  await fakeRealtime(page)
  const panel = await openLive(page)
  const live = panel.getByTestId('live-voice')
  // Opened ahead of time: connected, but nothing sent and the screen still waits for Start.
  await expect.poll(async () => (await rt(page)).connects).toBe(1)
  expect(await sent(page)).toEqual([])
  await expect(live).toHaveAttribute('data-state', 'idle')
  // A language change before Start reopens it in that language.
  await live.getByRole('group', { name: 'Reply language' }).getByRole('button', { name: 'Hinglish' }).click()
  await expect.poll(async () => (await rt(page)).connects).toBe(2)
  expect((await rt(page)).closed).toBe(1)
  // Start uses the open call: no new connection, the greeting goes straight out.
  await live.getByRole('button', { name: 'Start live voice' }).click()
  await expect.poll(async () => (await sent(page)).filter((e) => e.type === 'response.create').length).toBe(1)
  expect((await rt(page)).connects).toBe(2)
  const greeting = (await sent(page)).find((e) => e.type === 'conversation.item.create') as { item: { content: Array<{ text: string }> } }
  expect(greeting.item.content[0].text).toContain('in Hinglish')
})

test('a dropped connection reconnects and gives the conversation back to the new call', async ({ page }) => {
  await fakeRealtime(page)
  const panel = await openLive(page)
  const live = panel.getByTestId('live-voice')
  await live.getByRole('button', { name: 'Start live voice' }).click()
  await expect(live.getByTestId('live-status')).toHaveText('Thinking…')
  await emit(page, { type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Why did my sales drop?' })
  await emit(page, { type: 'response.output_audio_transcript.done', item_id: 'a1', transcript: 'Sales fell 32.5 percent on fewer orders.' })
  await page.evaluate(() => (window as unknown as { __rt: { drop: (r: string) => void } }).__rt.drop('failed'))
  await expect.poll(async () => (await rt(page)).connects).toBe(2)
  const replayed = (await sent(page)).filter((e) => e.type === 'conversation.item.create').map((e) => JSON.stringify(e))
  expect(replayed.some((e) => e.includes('Why did my sales drop?') && e.includes('"role":"user"'))).toBe(true)
  expect(replayed.some((e) => e.includes('Sales fell 32.5 percent') && e.includes('"role":"assistant"'))).toBe(true)
  expect(replayed.some((e) => e.includes('Do not greet again'))).toBe(true)
  await expect(live.getByTestId('live-status')).toHaveText('Listening. Speak naturally')
})

test('Back to chat ends the live call and the chat still works', async ({ page }) => {
  await fakeRealtime(page)
  const panel = await openLive(page)
  const live = panel.getByTestId('live-voice')
  await live.getByRole('button', { name: 'Start live voice' }).click()
  await expect.poll(async () => (await rt(page)).connects).toBe(1)
  await live.getByRole('button', { name: 'Chat' }).click()
  await expect(panel).toHaveAttribute('data-mode', 'chat')
  await expect.poll(async () => (await rt(page)).closed).toBe(1)
  await expect(panel.getByRole('textbox', { name: 'Message your Virtual KAM' })).toBeVisible()
})
