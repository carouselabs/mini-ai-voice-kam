/**
 * Live voice (OpenAI Realtime over WebRTC).
 *  GET  /api/realtime/health              can live voice start?
 *  POST /api/realtime/session             mint a short-lived client secret (the permanent key never leaves the server)
 *  POST /api/realtime/tool                run one data tool the voice agent asked for (validated, de-duplicated, audited)
 *  POST /api/realtime/language            instructions for a language change mid-call
 *  POST /api/realtime/transcript          the browser reports what was said (for the record and the test recorder)
 *  POST /api/realtime/session/:id/end     end the call
 *  GET  /api/realtime/session/:id         transcript and tool audit of a call (no secrets)
 */
import { createHash } from 'node:crypto'
import { Router, type Request } from 'express'
import {
  VOICE_LANGUAGES,
  type RealtimeHealth,
  type RealtimeSessionResponse,
  type RealtimeToolResponse,
  type VoiceLanguage,
} from '../../../shared/realtime.ts'
import type { ToolSpec } from '../ai/tools.ts'
import type { Store } from '../data/store.ts'
import { HttpError } from '../http/respond.ts'
import type { RealtimeConfig } from '../realtime/config.ts'
import { realtimeInstructions, transcriptionLanguage, greetingInstruction } from '../realtime/instructions.ts'
import { MAX_TOOL_CALLS, VoiceSessionStore } from '../realtime/sessions.ts'
import { realtimeToolDefinitions, realtimeTools, runRealtimeTool } from '../realtime/tools.ts'

export type MintSecret = (body: unknown, safetyId: string) => Promise<{ value: string; expires_at: number }>

/** Calls OpenAI to create a client secret. Errors carry only status and OpenAI's message, never the key. */
export function openAiMinter(apiKey: string): MintSecret {
  return async (body, safetyId) => {
    const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'OpenAI-Safety-Identifier': safetyId },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as { value?: string; expires_at?: number; error?: { message?: string } }
    if (!res.ok || !json.value) throw new Error(`OpenAI client_secrets ${res.status}: ${json.error?.message ?? 'no secret returned'}`)
    return { value: json.value, expires_at: json.expires_at ?? Math.floor(Date.now() / 1000) + 60 }
  }
}

function limiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>()
  return (key: string) => {
    const now = Date.now()
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    recent.push(now)
    hits.set(key, recent)
    return recent.length <= max
  }
}

export const SESSIONS_PER_10_MIN = 30

const isLanguage = (v: unknown): v is VoiceLanguage => typeof v === 'string' && (VOICE_LANGUAGES as string[]).includes(v)
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)
const clientOf = (req: Request) => req.ip ?? 'unknown'

export function createRealtimeRouter(deps: { config: RealtimeConfig; store: Store; allTools: ToolSpec[]; mint?: MintSecret }) {
  const { config, store } = deps
  const tools = realtimeTools(deps.allTools)
  const sessions = new VoiceSessionStore()
  const mint = deps.mint ?? (config.apiKey ? openAiMinter(config.apiKey) : null)
  // The live view opens a call ahead of time (and again on a language change), so a seller may use several per
  // visit. Creating one costs no tokens; this only stops abuse.
  const allowSession = limiter(Math.max(SESSIONS_PER_10_MIN, Number(process.env.AI_RATE_LIMIT) || SESSIONS_PER_10_MIN), 10 * 60_000)
  const router = Router()

  const available = () => config.issues.length === 0 && (config.provider === 'mock' || Boolean(mint))

  router.get('/health', (_req, res) => {
    const body: RealtimeHealth = {
      available: available(),
      provider: config.provider,
      model: available() ? config.model : null,
      voice: available() ? config.voice : null,
      reason: available() ? null : config.issues.join(' ') || 'Live voice is not configured.',
    }
    res.json(body)
  })

  /** The full session configuration sent to OpenAI when minting a secret. */
  const sessionConfig = (language: VoiceLanguage) => {
    const hint = transcriptionLanguage(language)
    return {
      type: 'realtime',
      model: config.model,
      instructions: realtimeInstructions(store, language),
      output_modalities: ['audio'],
      audio: {
        input: {
          noise_reduction: { type: 'near_field' },
          transcription: { model: config.transcriptionModel, ...(hint ? { language: hint } : {}) },
          // The turn detector decides when the seller has finished; interrupt_response lets them talk over the agent.
          turn_detection: { ...config.turnDetection, create_response: true, interrupt_response: true },
        },
        output: { voice: config.voice },
      },
      tools: realtimeToolDefinitions(tools),
      tool_choice: 'auto',
      reasoning: { effort: config.reasoningEffort },
    }
  }

  router.post('/session', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const language = body.language ?? 'auto'
    if (!isLanguage(language)) throw new HttpError(400, 'bad_request', `language must be one of ${VOICE_LANGUAGES.join(', ')}`)
    const replaces = body.replaces === undefined || body.replaces === null ? null : str(body.replaces, 80)
    if (body.replaces !== undefined && body.replaces !== null && !replaces) throw new HttpError(400, 'bad_request', 'replaces must be a session id')
    if (!available()) throw new HttpError(400, 'bad_request', config.issues.join(' ') || 'Live voice is not configured.')
    if (!allowSession(clientOf(req))) throw new HttpError(429, 'bad_request', 'Too many voice sessions. Wait a few minutes.')

    await sessions.load(replaces)
    const session = sessions.create(clientOf(req), language, replaces)
    await sessions.save(session.id, replaces)
    res.set('Cache-Control', 'no-store')
    if (config.provider === 'mock') {
      const mock: RealtimeSessionResponse = {
        voiceSessionId: session.id,
        clientSecret: 'mock-not-a-secret',
        expiresAt: Math.floor(Date.now() / 1000) + config.secretSeconds,
        model: 'mock-realtime',
        voice: config.voice,
        language,
        mock: true,
      }
      res.json({ ...mock, greeting: greetingInstruction(language, store) })
      return
    }
    try {
      const safetyId = createHash('sha256').update(clientOf(req)).digest('hex').slice(0, 32)
      const secret = await mint!({ expires_after: { anchor: 'created_at', seconds: config.secretSeconds }, session: sessionConfig(language) }, safetyId)
      const response: RealtimeSessionResponse = {
        voiceSessionId: session.id,
        clientSecret: secret.value,
        expiresAt: secret.expires_at,
        model: config.model,
        voice: config.voice,
        language,
        mock: false,
      }
      res.json({ ...response, greeting: greetingInstruction(language, store) })
    } catch (error) {
      sessions.end(session.id)
      await sessions.save(session.id).catch(() => {})
      console.error('Live voice session failed:', error instanceof Error ? error.message : error)
      throw new HttpError(502, 'internal_error', 'Could not start live voice. Try again, or use the chat.')
    }
  })

  router.post('/tool', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const voiceSessionId = str(body.voiceSessionId, 80)
    const callId = str(body.callId, 120)
    const name = str(body.name, 80)
    const args = typeof body.arguments === 'string' && body.arguments.length <= 4000 ? body.arguments : null
    if (!voiceSessionId || !callId || !name || args === null) throw new HttpError(400, 'bad_request', 'voiceSessionId, callId, name and arguments are required')
    await sessions.load(voiceSessionId)
    const session = sessions.active(voiceSessionId)
    if (!session) throw new HttpError(404, 'not_found', 'This voice call has ended. Start a new one.')
    // The same call_id never runs twice (a retried or duplicated event returns the first result).
    const previous = session.toolCalls.get(callId)
    if (previous) {
      res.json({ ...previous.result, duplicate: true } satisfies RealtimeToolResponse)
      return
    }
    if (session.toolCalls.size >= MAX_TOOL_CALLS) throw new HttpError(429, 'bad_request', 'Too many data checks in this call. Start a new one.')
    if (!tools.some((t) => t.name === name)) {
      const result: RealtimeToolResponse = { ok: false, output: JSON.stringify({ error: `Tool "${name}" is not available in voice.` }), evidence: [], tracker: [], label: 'Unknown check', ms: 0, duplicate: false }
      session.toolCalls.set(callId, { name, arguments: args, at: new Date().toISOString(), result })
      await sessions.save(session.id)
      res.json(result)
      return
    }
    const result: RealtimeToolResponse = { ...runRealtimeTool(tools, store, name, args), duplicate: false }
    session.toolCalls.set(callId, { name, arguments: args, at: new Date().toISOString(), result })
    await sessions.save(session.id)
    res.json(result)
  })

  router.post('/language', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const id = str(body.voiceSessionId, 80) ?? ''
    await sessions.load(id)
    const session = sessions.active(id)
    if (!session) throw new HttpError(404, 'not_found', 'This voice call has ended.')
    if (!isLanguage(body.language)) throw new HttpError(400, 'bad_request', `language must be one of ${VOICE_LANGUAGES.join(', ')}`)
    session.language = body.language
    await sessions.save(session.id)
    const hint = transcriptionLanguage(body.language)
    // A ready-to-send session.update payload: new language rules and the matching speech-recognition hint.
    res.json({
      session: {
        type: 'realtime',
        instructions: realtimeInstructions(store, body.language),
        audio: { input: { transcription: { model: config.transcriptionModel, ...(hint ? { language: hint } : {}) } } },
      },
    })
  })

  router.post('/transcript', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const id = str(body.voiceSessionId, 80) ?? ''
    await sessions.load(id)
    const session = sessions.get(id)
    if (!session) throw new HttpError(404, 'not_found', 'Unknown voice call.')
    const role = body.role === 'seller' || body.role === 'assistant' ? body.role : null
    const text = str(body.text, 4000)
    if (!role || !text) throw new HttpError(400, 'bad_request', 'role (seller or assistant) and text are required')
    const timing: Record<string, number> = {}
    if (body.timing && typeof body.timing === 'object') {
      for (const [k, v] of Object.entries(body.timing as Record<string, unknown>).slice(0, 12)) if (typeof v === 'number' && Number.isFinite(v)) timing[k.slice(0, 40)] = Math.round(v)
    }
    sessions.addTranscript(session, { role, text, at: new Date().toISOString(), ...(Object.keys(timing).length ? { timing } : {}), ...(body.interrupted === true ? { interrupted: true } : {}) })
    await sessions.save(session.id)
    res.status(204).end()
  })

  router.post('/session/:id/end', async (req, res) => {
    await sessions.load(req.params.id)
    if (sessions.end(req.params.id)) await sessions.save(req.params.id)
    res.status(204).end()
  })

  router.get('/session/:id', async (req, res) => {
    await sessions.load(req.params.id)
    const s = sessions.get(req.params.id)
    if (!s) throw new HttpError(404, 'not_found', 'Unknown voice call.')
    res.json({
      id: s.id,
      language: s.language,
      createdAt: new Date(s.createdAt).toISOString(),
      endedAt: s.endedAt ? new Date(s.endedAt).toISOString() : null,
      transcript: s.transcript,
      toolCalls: [...s.toolCalls.entries()].map(([callId, c]) => ({ callId, name: c.name, arguments: c.arguments, at: c.at, ok: c.result.ok, ms: c.result.ms })),
    })
  })

  return router
}
