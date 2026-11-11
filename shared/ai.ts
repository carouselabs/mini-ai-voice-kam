/** Contract between the AI routes and the assistant UI. */
import type { ActionPriority, Confidence } from './insights.ts'
import type { SourceType } from './records.ts'
import type { RecommendationState, TrackerPriority, TrackerStatus } from './tracker.ts'

export type ReplyLanguage = 'en' | 'hi' | 'hinglish'

export interface AiHealth {
  provider: 'openai' | 'mock'
  /** True when the assistant can answer. False means the panel shows how to configure it. */
  configured: boolean
  model: string | null
  modelSource: 'env' | 'auto' | 'mock' | null
  maxToolRounds: number
  issues: string[]
}

export interface EvidenceCard {
  findingId: string
  title: string
  observation: string
  impact: string
  confidence: Confidence
  dataSource: SourceType | 'mixed'
  evidence: Array<{ label: string; value: string; source: SourceType }>
  products: string[]
  /** The months compared, e.g. "Sep 2026 → Oct 2026". */
  period: string
  lastUpdatedAt: string
  link: { path: string; label: string } | null
}

/** A recommended action the reply discusses, with where it stands in the tracker. */
export interface ActionCard {
  actionId: string
  title: string
  priority: ActionPriority
  problem: string
  metricToMonitor: string
  /** A risk to check first, e.g. defects before reordering. */
  caution: string | null
  owner: string
  suggestedDeadline: string
  state: RecommendationState
  trackerActionId: string | null
}

/** A tracker entry Mini AI created during this reply. Always awaiting the seller's approval. */
export interface TrackerCard {
  id: string
  recommendationId: string | null
  title: string
  status: TrackerStatus
  priority: TrackerPriority
  owner: string
  dueDate: string
}

export interface AssistantReply {
  id: string
  text: string
  language: ReplyLanguage
  /** Findings: what the data shows. */
  evidence: EvidenceCard[]
  /** Recommendations: what the seller could do. Kept separate from findings. */
  actions: ActionCard[]
  /** Tracker entries created in this reply, waiting for the seller to approve. */
  tracker: TrackerCard[]
  links: Array<{ path: string; label: string }>
  /** Labels of the data checks that actually ran for this reply. */
  checks: string[]
  model: string
  /** True when the reply came from the scripted test model, never a real LLM. */
  mock: boolean
  timing: ReplyTiming
  /** Present when a draft overstated the evidence and was rewritten (revised), or still does (remaining). */
  claimCheck?: { revised: string[]; remaining: string[] }
}

/** Server-side timing for one answer, in milliseconds. */
export interface ReplyTiming {
  totalMs: number
  modelMs: number
  toolMs: number
  modelRounds: number
  tools: Array<{ label: string; ms: number }>
}

export type AiStreamEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'tool'; status: 'start' | 'end'; callId: string; label: string; ok?: boolean }
  | { type: 'reply'; reply: AssistantReply }
  | { type: 'error'; code: 'not_configured' | 'bad_request' | 'not_found' | 'busy' | 'rate_limited' | 'llm_error' | 'timeout'; message: string }
  | { type: 'done' }

export interface TranscriptEntry {
  role: 'seller' | 'assistant'
  text: string
  at: string
  /** Seller messages: spoken (browser speech recognition) or typed. */
  via?: 'voice' | 'text'
  /** Seller voice messages: milliseconds from the start of listening to the final transcript. */
  recognitionMs?: number
  /** Assistant messages: server timing. */
  timing?: ReplyTiming
}
