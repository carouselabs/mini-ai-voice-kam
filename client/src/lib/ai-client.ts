import type { AiHealth, AiStreamEvent } from '@shared/ai.ts'
import { ApiRequestError } from './api'

/** POSTs to an AI endpoint and reports each server-sent event as it arrives. */
export async function streamAi(path: string, body: unknown, onEvent: (event: AiStreamEvent) => void, signal?: AbortSignal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok || !response.body) {
    const error = (await response.json().catch(() => null))?.error
    throw new ApiRequestError(response.status, error?.message ?? `Request failed (${response.status})`, error?.details)
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const data = block.split('\n').find((line) => line.startsWith('data: '))
      if (data) onEvent(JSON.parse(data.slice(6)) as AiStreamEvent)
    }
  }
}

export async function fetchAiHealth(): Promise<AiHealth | null> {
  try {
    const response = await fetch('/api/ai/health')
    return response.ok ? ((await response.json()) as AiHealth) : null
  } catch {
    return null
  }
}

export function endAiSession(sessionId: string) {
  // Fire and forget: ending is best-effort cleanup.
  void fetch(`/api/ai/sessions/${encodeURIComponent(sessionId)}/end`, { method: 'POST', keepalive: true }).catch(() => {})
}
