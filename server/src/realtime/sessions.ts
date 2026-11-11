import { randomUUID } from 'node:crypto'
import type { RealtimeToolResponse, RealtimeTranscriptEntry, VoiceLanguage } from '../../../shared/realtime.ts'
import { sharedKv, type Kv } from '../kv.ts'

/** A live voice call as the server sees it: which tools ran (the audit trail) and the transcript the browser reported. */
export interface VoiceSession {
  id: string
  client: string
  language: VoiceLanguage
  createdAt: number
  expiresAt: number
  endedAt: number | null
  /** call_id → result, so a repeated call_id never runs a tool twice. */
  toolCalls: Map<string, { name: string; arguments: string; at: string; result: RealtimeToolResponse }>
  transcript: RealtimeTranscriptEntry[]
}

const MAX_MINUTES = 60
/**
 * Abuse limit per network address, not a one-call rule: several people can share one address (an office, a home
 * router). A browser tab avoids duplicate calls itself by passing `replaces` with its previous call.
 */
export const MAX_ACTIVE_PER_CLIENT = 5
const MAX_TRANSCRIPT = 300
export const MAX_TOOL_CALLS = 150

type StoredVoiceSession = Omit<VoiceSession, 'toolCalls'> & { toolCalls: Array<[string, VoiceSession['toolCalls'] extends Map<string, infer V> ? V : never]> }

export class VoiceSessionStore {
  private sessions = new Map<string, VoiceSession>()
  private kv: () => Kv | null

  constructor(kv: () => Kv | null = sharedKv) {
    this.kv = kv
  }

  /**
   * Hosted mode: fetches the latest copy of these calls from shared storage, because the tool, language and
   * transcript requests of one call may land on different instances. Locally they are already in memory.
   */
  async load(...ids: Array<string | null | undefined>): Promise<void> {
    const kv = this.kv()
    const wanted = ids.filter((id): id is string => Boolean(id))
    if (!kv || !wanted.length) return
    const values = await kv.mget(wanted.map((id) => `voice:${id}`))
    wanted.forEach((id, i) => {
      const raw = values[i]
      if (!raw) return
      const stored = JSON.parse(raw) as StoredVoiceSession
      this.sessions.set(id, { ...stored, toolCalls: new Map(stored.toolCalls) })
    })
  }

  /** Hosted mode: saves these calls (kept two hours, like the in-memory record). */
  async save(...ids: Array<string | null | undefined>): Promise<void> {
    const kv = this.kv()
    if (!kv) return
    await Promise.all(
      ids
        .map((id) => (id ? this.sessions.get(id) : undefined))
        .filter((s): s is VoiceSession => Boolean(s))
        .map((s) => kv.set(`voice:${s.id}`, JSON.stringify({ ...s, toolCalls: [...s.toolCalls] } satisfies StoredVoiceSession), 2 * 60 * 60)),
    )
  }

  create(client: string, language: VoiceLanguage, replaces: string | null): VoiceSession {
    this.sweep()
    if (replaces) this.end(replaces)
    // Over the per-address limit, the oldest live calls from that address end.
    const active = [...this.sessions.values()].filter((s) => s.client === client && !s.endedAt).sort((a, b) => a.createdAt - b.createdAt)
    for (const s of active.slice(0, Math.max(0, active.length - (MAX_ACTIVE_PER_CLIENT - 1)))) s.endedAt = Date.now()
    const now = Date.now()
    const session: VoiceSession = {
      id: `voice_${randomUUID()}`,
      client,
      language,
      createdAt: now,
      expiresAt: now + MAX_MINUTES * 60_000,
      endedAt: null,
      toolCalls: new Map(),
      transcript: [],
    }
    this.sessions.set(session.id, session)
    return session
  }

  /** A live, unexpired session, or null. */
  active(id: string): VoiceSession | null {
    const s = this.sessions.get(id)
    if (!s || s.endedAt || Date.now() > s.expiresAt) return null
    return s
  }

  /** Any session, ended or not (for the transcript after a call). */
  get(id: string): VoiceSession | null {
    return this.sessions.get(id) ?? null
  }

  end(id: string): boolean {
    const s = this.sessions.get(id)
    if (!s || s.endedAt) return false
    s.endedAt = Date.now()
    return true
  }

  addTranscript(s: VoiceSession, entry: RealtimeTranscriptEntry) {
    s.transcript.push(entry)
    if (s.transcript.length > MAX_TRANSCRIPT) s.transcript.splice(0, s.transcript.length - MAX_TRANSCRIPT)
  }

  /** Ended sessions are kept for an hour so their transcript can still be read, then removed. */
  private sweep() {
    const cutoff = Date.now() - 60 * 60_000
    for (const [id, s] of this.sessions) if ((s.endedAt ?? s.expiresAt) < cutoff) this.sessions.delete(id)
  }
}
