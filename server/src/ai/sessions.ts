import { randomUUID } from 'node:crypto'
import type { TranscriptEntry } from '../../../shared/ai.ts'
import type { Finding } from '../../../shared/insights.ts'
import { sharedKv, type Kv } from '../kv.ts'
import type { InputItem } from './provider.ts'

export interface Turn {
  items: InputItem[]
  size: number
}

/** One conversation. Kept in memory only, removed after inactivity; no audio is ever stored. */
export interface Session {
  id: string
  createdAt: number
  lastActiveAt: number
  turns: Turn[]
  transcript: TranscriptEntry[]
  /** Findings seen in tool results, so cited findings can be shown with their real evidence. */
  findings: Map<string, Finding>
  busy: boolean
  recentClientIds: string[]
}

export const HISTORY_LIMITS = { turns: 10, chars: 140_000, transcript: 80 } as const

/** What is saved in shared storage when hosted: the session without its in-process busy flag. */
type StoredSession = Omit<Session, 'findings' | 'busy'> & { findings: Array<[string, Finding]> }

export class SessionStore {
  private sessions = new Map<string, Session>()
  private ttlMs: number
  private max: number
  private kv: () => Kv | null

  constructor({ ttlMs = 30 * 60_000, max = 200, kv = sharedKv }: { ttlMs?: number; max?: number; kv?: () => Kv | null } = {}) {
    this.ttlMs = ttlMs
    this.max = max
    this.kv = kv
  }

  /**
   * Hosted mode: fetches the latest copy from shared storage (another instance may have answered the previous turn),
   * keeping this instance's busy flag. Locally the session is already in memory.
   */
  async load(id: string): Promise<Session | null> {
    const kv = this.kv()
    if (kv && id) {
      const raw = await kv.get(`chat:${id}`)
      if (!raw) {
        this.sessions.delete(id)
        return null
      }
      const stored = JSON.parse(raw) as StoredSession
      const session: Session = { ...stored, findings: new Map(stored.findings), busy: this.sessions.get(id)?.busy ?? false }
      this.sessions.set(id, session)
    }
    return this.get(id)
  }

  /** Hosted mode: saves the session for the next request. Locally it lives in memory already. */
  async save(session: Session): Promise<void> {
    const kv = this.kv()
    if (!kv) return
    const { busy: _busy, findings, ...rest } = session
    const stored: StoredSession = { ...rest, findings: [...findings] }
    await kv.set(`chat:${session.id}`, JSON.stringify(stored), Math.ceil(this.ttlMs / 1000))
  }

  async remove(id: string): Promise<boolean> {
    const kv = this.kv()
    const had = this.end(id)
    if (!kv) return had
    const existed = had || Boolean(await kv.get(`chat:${id}`))
    await kv.del(`chat:${id}`)
    return existed
  }

  create(): Session {
    this.sweep()
    if (this.sessions.size >= this.max) {
      const oldest = [...this.sessions.values()].sort((a, b) => a.lastActiveAt - b.lastActiveAt)[0]
      this.sessions.delete(oldest.id)
    }
    const now = Date.now()
    const session: Session = { id: randomUUID(), createdAt: now, lastActiveAt: now, turns: [], transcript: [], findings: new Map(), busy: false, recentClientIds: [] }
    this.sessions.set(session.id, session)
    return session
  }

  get(id: string): Session | null {
    const session = this.sessions.get(id)
    if (!session) return null
    if (Date.now() - session.lastActiveAt > this.ttlMs) {
      this.sessions.delete(id)
      return null
    }
    return session
  }

  end(id: string): boolean {
    return this.sessions.delete(id)
  }

  sweep() {
    const now = Date.now()
    for (const [id, s] of this.sessions) if (now - s.lastActiveAt > this.ttlMs) this.sessions.delete(id)
  }

  get size() {
    return this.sessions.size
  }
}

/** Adds a finished turn and drops the oldest turns beyond the limits (whole turns, so tool calls stay paired). */
export function addTurn(session: Session, items: InputItem[]) {
  session.turns.push({ items, size: JSON.stringify(items).length })
  while (
    session.turns.length > HISTORY_LIMITS.turns ||
    (session.turns.length > 1 && session.turns.reduce((s, t) => s + t.size, 0) > HISTORY_LIMITS.chars)
  ) {
    session.turns.shift()
  }
}

export function history(session: Session): InputItem[] {
  return session.turns.flatMap((t) => t.items)
}

export function remember(session: Session, entry: TranscriptEntry) {
  session.transcript.push(entry)
  if (session.transcript.length > HISTORY_LIMITS.transcript) session.transcript.shift()
}
