import { Router, type Response } from 'express'
import type { AiStreamEvent } from '../../../shared/ai.ts'
import { openSession, runTurn, type EngineDeps } from '../ai/engine.ts'
import { ProviderError, type InputItem } from '../ai/provider.ts'
import type { AiService } from '../ai/service.ts'
import { HttpError } from '../http/respond.ts'

const MAX_MESSAGE_CHARS = 1000
/** AI_RATE_LIMIT raises the cap for automated test runs, which send far more requests than a seller would. */
const RATE_LIMIT = { windowMs: 5 * 60_000, max: Math.min(10_000, Math.max(1, Number(process.env.AI_RATE_LIMIT) || 40)) }
const TURN_DEADLINE_MS = 120_000

/** Small in-memory limiter for a demo: 40 AI requests per IP per 5 minutes by default. */
function rateLimiter() {
  const hits = new Map<string, number[]>()
  return (ip: string): boolean => {
    const now = Date.now()
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs)
    if (recent.length >= RATE_LIMIT.max) {
      hits.set(ip, recent)
      return false
    }
    recent.push(now)
    hits.set(ip, recent)
    return true
  }
}

/** Server-sent events: tool progress as it happens, then the reply. */
function openStream(res: Response) {
  res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.flushHeaders()
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), TURN_DEADLINE_MS)
  res.on('close', () => controller.abort())
  return {
    signal: controller.signal,
    send(event: AiStreamEvent) {
      if (!res.writableEnded) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    },
    end() {
      clearTimeout(deadline)
      if (!res.writableEnded) {
        res.write(`event: done\ndata: {"type":"done"}\n\n`)
        res.end()
      }
    },
  }
}

function failure(error: unknown): AiStreamEvent {
  if (error instanceof ProviderError) return { type: 'error', code: error.code, message: error.message }
  if (error instanceof Error && error.name === 'AbortError') return { type: 'error', code: 'timeout', message: 'The answer took too long. Please try again.' }
  console.error('AI turn failed:', error instanceof Error ? error.message : error)
  return { type: 'error', code: 'llm_error', message: 'Something went wrong while preparing the answer. Please try again.' }
}

export function createAiRouter(ai: AiService) {
  const router = Router()
  const allow = rateLimiter()

  const notConfigured = (): AiStreamEvent => ({
    type: 'error',
    code: 'not_configured',
    message: ai.config.issues[0] ?? 'The AI model is not configured. Add OPENAI_API_KEY to server/.env and restart the server.',
  })

  const deps = (): EngineDeps => ({ provider: ai.provider!, tools: ai.tools, store: ai.store, maxToolRounds: ai.config.maxToolRounds })

  router.get('/health', async (_req, res) => {
    res.json(await ai.health())
  })

  router.post('/sessions', async (req, res) => {
    if (!allow(req.ip ?? 'unknown')) throw new HttpError(429, 'bad_request', 'Too many requests. Wait a few minutes.')
    const stream = openStream(res)
    if (!ai.provider) {
      stream.send(notConfigured())
      return stream.end()
    }
    const session = ai.sessions.create()
    stream.send({ type: 'session', sessionId: session.id })
    try {
      // Instant: the account checks plus a greeting from the verified figures, no model call.
      const reply = openSession(deps(), session, (e) => stream.send({ type: 'tool', ...e }))
      await ai.sessions.save(session)
      stream.send({ type: 'reply', reply })
    } catch (error) {
      stream.send(failure(error))
    } finally {
      stream.end()
    }
  })

  router.post('/chat', async (req, res) => {
    if (!allow(req.ip ?? 'unknown')) throw new HttpError(429, 'bad_request', 'Too many requests. Wait a few minutes.')
    const body = (req.body ?? {}) as { sessionId?: unknown; message?: unknown; clientMessageId?: unknown; via?: unknown; recognitionMs?: unknown }
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const problems: string[] = []
    if (typeof body.sessionId !== 'string' || body.sessionId.length > 64) problems.push('sessionId is required')
    if (!message) problems.push('message is required')
    if (message.length > MAX_MESSAGE_CHARS) problems.push(`message must be ${MAX_MESSAGE_CHARS} characters or fewer`)
    if (body.clientMessageId !== undefined && (typeof body.clientMessageId !== 'string' || body.clientMessageId.length > 64)) {
      problems.push('clientMessageId must be a short string')
    }
    if (body.via !== undefined && body.via !== 'voice' && body.via !== 'text') problems.push('via must be "voice" or "text"')
    if (body.recognitionMs !== undefined && (typeof body.recognitionMs !== 'number' || body.recognitionMs < 0 || body.recognitionMs > 600_000)) {
      problems.push('recognitionMs must be a number of milliseconds')
    }
    if (problems.length) throw new HttpError(400, 'bad_request', 'Invalid chat request', problems)

    const stream = openStream(res)
    if (!ai.provider) {
      stream.send(notConfigured())
      return stream.end()
    }
    const session = await ai.sessions.load(body.sessionId as string)
    if (!session) {
      stream.send({ type: 'error', code: 'not_found', message: 'This conversation has ended. Start a new one.' })
      return stream.end()
    }
    const clientId = body.clientMessageId as string | undefined
    if (clientId && session.recentClientIds.includes(clientId)) {
      stream.send({ type: 'error', code: 'bad_request', message: 'That message was already sent.' })
      return stream.end()
    }
    if (session.busy) {
      stream.send({ type: 'error', code: 'busy', message: 'Still working on your previous message.' })
      return stream.end()
    }
    if (clientId) session.recentClientIds = [...session.recentClientIds.slice(-19), clientId]

    session.busy = true
    try {
      const opening = [{ role: 'user', content: message } as InputItem]
      const seller = { via: body.via as 'voice' | 'text' | undefined, recognitionMs: typeof body.recognitionMs === 'number' ? Math.round(body.recognitionMs) : undefined }
      const reply = await runTurn(deps(), session, opening, (e) => stream.send({ type: 'tool', ...e }), stream.signal, message, [], seller)
      await ai.sessions.save(session)
      stream.send({ type: 'reply', reply })
    } catch (error) {
      stream.send(failure(error))
    } finally {
      session.busy = false
      stream.end()
    }
  })

  router.get('/sessions/:sessionId', async (req, res) => {
    const session = await ai.sessions.load(req.params.sessionId)
    if (!session) throw new HttpError(404, 'not_found', 'Conversation not found')
    res.json({ sessionId: session.id, createdAt: new Date(session.createdAt).toISOString(), transcript: session.transcript })
  })

  router.post('/sessions/:sessionId/end', async (req, res) => {
    res.json({ ended: await ai.sessions.remove(req.params.sessionId) })
  })

  return router
}
