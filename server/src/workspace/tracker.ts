import { randomUUID } from 'node:crypto'
import type { ActionPriority, ActionRecommendation } from '../../../shared/insights.ts'
import {
  STATUS_TRANSITIONS,
  TRACKER_STATUSES,
  type RecommendationView,
  type TrackerAction,
  type TrackerPriority,
  type TrackerStatus,
  type TrackerSummary,
} from '../../../shared/tracker.ts'
import { HttpError } from '../http/respond.ts'
import { JsonFile } from './json-file.ts'

interface Decision {
  recommendationId: string
  decision: 'rejected'
  reason: string
  at: string
}

interface TrackerFile {
  actions: TrackerAction[]
  decisions: Decision[]
}

const PRIORITY: Record<ActionPriority, TrackerPriority> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
const DUE_DAYS: Record<TrackerPriority, number> = { Critical: 2, High: 5, Medium: 10, Low: 14 }
const ACTIVE: TrackerStatus[] = ['Approved', 'In Progress', 'Blocked']
const MAX_ACTIONS = 200

const today = () => new Date().toISOString().slice(0, 10)
const addDays = (days: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

export interface CreateInput {
  recommendationId?: string | null
  title?: string
  description?: string
  owner?: string
  dueDate?: string
  priority?: TrackerPriority
  /** True only when the seller has explicitly approved. Mini AI always passes false. */
  approve: boolean
  createdBy: 'seller' | 'mini-ai'
  note?: string
}

/**
 * The seller's internal action tracker. Entries created by Mini AI always start as
 * "Awaiting Approval"; only the seller (through the UI or API with approve: true) can approve.
 */
export class TrackerService {
  private file = new JsonFile<TrackerFile>('tracker.json', () => ({ actions: [], decisions: [] }))

  private load() {
    return this.file.read()
  }

  list(): TrackerAction[] {
    return this.load().actions
  }

  summary(actions = this.list()): TrackerSummary {
    const byStatus = Object.fromEntries(TRACKER_STATUSES.map((s) => [s, actions.filter((a) => a.status === s).length])) as Record<TrackerStatus, number>
    const committed = actions.filter((a) => [...ACTIVE, 'Completed'].includes(a.status)).length
    return {
      total: actions.length,
      byStatus,
      active: actions.filter((a) => ACTIVE.includes(a.status)).length,
      overdue: actions.filter((a) => isOverdue(a)).length,
      completed: byStatus.Completed,
      completionRate: committed ? Math.round((byStatus.Completed / committed) * 1000) / 1000 : null,
    }
  }

  create(rec: ActionRecommendation | null, input: CreateInput): TrackerAction {
    const data = this.load()
    if (data.actions.length >= MAX_ACTIONS) throw new HttpError(409, 'conflict', 'The tracker is full. Complete or remove some actions first.')
    if (rec) {
      const open = data.actions.find((a) => a.recommendationId === rec.actionId && a.status !== 'Rejected' && a.status !== 'Completed')
      if (open) throw new HttpError(409, 'conflict', `This recommendation is already in the tracker (${open.status}).`)
    }
    const title = (input.title ?? rec?.title ?? '').trim()
    if (!title || title.length > 160) throw new HttpError(400, 'bad_request', 'A title of up to 160 characters is required.')
    const priority = input.priority ?? (rec ? PRIORITY[rec.priority] : 'Medium')
    if (!Object.keys(DUE_DAYS).includes(priority)) throw new HttpError(400, 'bad_request', 'Priority must be Critical, High, Medium or Low.')
    if (input.dueDate !== undefined && !isDate(input.dueDate)) throw new HttpError(400, 'bad_request', 'dueDate must be YYYY-MM-DD.')
    const owner = (input.owner ?? rec?.suggestedOwner ?? 'Seller').trim().slice(0, 80) || 'Seller'
    const now = new Date().toISOString()
    const status: TrackerStatus = input.approve ? 'Approved' : 'Awaiting Approval'
    const action: TrackerAction = {
      id: `TRK-${randomUUID().slice(0, 8).toUpperCase()}`,
      recommendationId: rec?.actionId ?? null,
      title,
      description: (input.description ?? rec?.description ?? '').slice(0, 600),
      priority,
      owner,
      dueDate: input.dueDate ?? addDays(DUE_DAYS[priority]),
      status,
      metricToMonitor: rec?.metricToMonitor ?? '',
      verification: rec?.verification ?? '',
      evidence: rec?.supportingEvidence.slice(0, 5) ?? [],
      affectedProducts: rec?.affectedProducts ?? [],
      createdAt: now,
      createdBy: input.createdBy,
      approvedAt: input.approve ? now : null,
      completedAt: null,
      notes: input.note?.trim() ? [{ at: now, author: input.createdBy, text: input.note.trim().slice(0, 500) }] : [],
      history: [{ at: now, from: null, to: status }],
    }
    data.actions.unshift(action)
    // Adding a rejected recommendation back means the seller changed their mind.
    if (rec) data.decisions = data.decisions.filter((d) => d.recommendationId !== rec.actionId)
    this.file.write(data)
    return action
  }

  /** Seller approval. Never called on Mini AI's behalf. */
  approve(id: string): TrackerAction {
    return this.update(id, { status: 'Approved' })
  }

  update(id: string, patch: { status?: TrackerStatus; owner?: string; dueDate?: string; priority?: TrackerPriority }): TrackerAction {
    const data = this.load()
    const action = data.actions.find((a) => a.id === id)
    if (!action) throw new HttpError(404, 'not_found', 'Action not found.')
    const now = new Date().toISOString()
    if (patch.status && patch.status !== action.status) {
      if (!STATUS_TRANSITIONS[action.status].includes(patch.status)) {
        throw new HttpError(400, 'bad_request', `An action that is ${action.status} cannot move to ${patch.status}.`)
      }
      action.history.push({ at: now, from: action.status, to: patch.status })
      if (patch.status === 'Approved' && !action.approvedAt) action.approvedAt = now
      action.completedAt = patch.status === 'Completed' ? now : null
      action.status = patch.status
    }
    if (patch.owner !== undefined) {
      const owner = patch.owner.trim()
      if (!owner || owner.length > 80) throw new HttpError(400, 'bad_request', 'Owner must be 1–80 characters.')
      action.owner = owner
    }
    if (patch.dueDate !== undefined) {
      if (!isDate(patch.dueDate)) throw new HttpError(400, 'bad_request', 'dueDate must be YYYY-MM-DD.')
      action.dueDate = patch.dueDate
    }
    if (patch.priority !== undefined) {
      if (!Object.keys(DUE_DAYS).includes(patch.priority)) throw new HttpError(400, 'bad_request', 'Priority must be Critical, High, Medium or Low.')
      action.priority = patch.priority
    }
    this.file.write(data)
    return action
  }

  addNote(id: string, text: string, author: 'seller' | 'mini-ai'): TrackerAction {
    const note = text.trim()
    if (!note || note.length > 500) throw new HttpError(400, 'bad_request', 'A note of 1–500 characters is required.')
    const data = this.load()
    const action = data.actions.find((a) => a.id === id)
    if (!action) throw new HttpError(404, 'not_found', 'Action not found.')
    action.notes.push({ at: new Date().toISOString(), author, text: note })
    this.file.write(data)
    return action
  }

  rejectRecommendation(recommendationId: string, reason: string) {
    const data = this.load()
    data.decisions = data.decisions.filter((d) => d.recommendationId !== recommendationId)
    data.decisions.push({ recommendationId, decision: 'rejected', reason: reason.trim().slice(0, 300), at: new Date().toISOString() })
    this.file.write(data)
  }

  restoreRecommendation(recommendationId: string) {
    const data = this.load()
    data.decisions = data.decisions.filter((d) => d.recommendationId !== recommendationId)
    this.file.write(data)
  }

  /** Each recommendation with where it stands: proposed, awaiting approval, in the tracker, completed or rejected. */
  views(recommendations: ActionRecommendation[]): RecommendationView[] {
    const { actions, decisions } = this.load()
    return recommendations.map((rec) => {
      const linked = actions.filter((a) => a.recommendationId === rec.actionId && a.status !== 'Rejected')
      const latest = linked[0] ?? null
      const decision = decisions.find((d) => d.recommendationId === rec.actionId)
      const state: RecommendationView['state'] = latest
        ? latest.status === 'Completed'
          ? 'completed'
          : latest.status === 'Awaiting Approval'
            ? 'awaiting_approval'
            : 'in_tracker'
        : decision
          ? 'rejected'
          : 'proposed'
      return { ...rec, state, trackerActionId: latest?.id ?? null, rejectionReason: decision?.reason ?? null }
    })
  }
}

export function isOverdue(action: TrackerAction, on = today()): boolean {
  return ACTIVE.includes(action.status) && action.dueDate < on
}
