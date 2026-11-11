import { Router, type Request } from 'express'
import type { SourceType } from '../../../shared/records.ts'
import { TRACKER_STATUSES, type TrackerPriority, type TrackerStatus } from '../../../shared/tracker.ts'
import { getStore } from '../data/store.ts'
import { parseQuery } from '../http/query.ts'
import { HttpError, notFound, send } from '../http/respond.ts'
import { buildBusinessReview } from '../insights/review.ts'
import { recommendationsWithFindings } from '../investigations/index.ts'
import { getWorkspace, trackerList } from '../workspace/index.ts'

const PRIORITIES: TrackerPriority[] = ['Critical', 'High', 'Medium', 'Low']
const SELLER: SourceType[] = ['seller_provided']
const DECISION: SourceType[] = ['assignment_provided', 'synthetic_demo', 'seller_provided']

type Body = Record<string, string | boolean | undefined>

/** Reads a JSON body, rejecting unknown fields and wrong types. */
function body(req: Request, fields: Record<string, 'string' | 'boolean'>): Body {
  const raw: unknown = req.body
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'bad_request', 'Body must be a JSON object')
  const input = raw as Record<string, unknown>
  const problems: string[] = []
  for (const key of Object.keys(input)) if (!(key in fields)) problems.push(`Unknown field: ${key}`)
  for (const [key, type] of Object.entries(fields)) {
    if (input[key] !== undefined && typeof input[key] !== type) problems.push(`${key} must be a ${type}`)
  }
  if (problems.length) throw new HttpError(400, 'bad_request', 'Invalid request body', problems)
  return input as Body
}

const text = (value: string | boolean | undefined) => (typeof value === 'string' ? value : undefined)

function priority(value: string | boolean | undefined): TrackerPriority | undefined {
  if (value === undefined) return undefined
  if (!PRIORITIES.includes(value as TrackerPriority)) throw new HttpError(400, 'bad_request', `priority must be one of ${PRIORITIES.join(', ')}`)
  return value as TrackerPriority
}

function recommendation(id: string) {
  const rec = recommendationsWithFindings(getStore()).find((r) => r.actionId === id)
  if (!rec) throw notFound(`Recommendation "${id}"`)
  return rec
}

/* ---------- Action tracker ---------- */

export const trackerRouter = Router()

trackerRouter.get('/', (req, res) => {
  const store = getStore()
  parseQuery(req, store, [])
  send(res, store, trackerList(), SELLER, {
    notes: ['Internal to-do list for this demo seller. Mini AI never contacts anyone or changes anything outside this list.'],
  })
})

trackerRouter.post('/', (req, res) => {
  const input = body(req, {
    recommendationId: 'string', title: 'string', description: 'string', owner: 'string',
    dueDate: 'string', priority: 'string', approve: 'boolean', note: 'string',
  })
  const recId = text(input.recommendationId)
  const rec = recId ? recommendation(recId) : null
  if (!rec && !text(input.title)) throw new HttpError(400, 'bad_request', 'Give a recommendationId or a title')
  const action = getWorkspace().tracker.create(rec, {
    title: text(input.title),
    description: text(input.description),
    owner: text(input.owner),
    dueDate: text(input.dueDate),
    priority: priority(input.priority),
    note: text(input.note),
    approve: input.approve === true,
    createdBy: 'seller',
  })
  res.status(201)
  send(res, getStore(), action, SELLER)
})

trackerRouter.post('/:id/approve', (req, res) => {
  body(req, {})
  send(res, getStore(), getWorkspace().tracker.approve(req.params.id), SELLER)
})

trackerRouter.patch('/:id', (req, res) => {
  const input = body(req, { status: 'string', owner: 'string', dueDate: 'string', priority: 'string' })
  const status = text(input.status)
  if (status !== undefined && !TRACKER_STATUSES.includes(status as TrackerStatus)) {
    throw new HttpError(400, 'bad_request', `status must be one of ${TRACKER_STATUSES.join(', ')}`)
  }
  const action = getWorkspace().tracker.update(req.params.id, {
    status: status as TrackerStatus | undefined,
    owner: text(input.owner),
    dueDate: text(input.dueDate),
    priority: priority(input.priority),
  })
  send(res, getStore(), action, SELLER)
})

trackerRouter.post('/:id/notes', (req, res) => {
  const input = body(req, { text: 'string' })
  send(res, getStore(), getWorkspace().tracker.addNote(req.params.id, text(input.text) ?? '', 'seller'), SELLER)
})

/* ---------- Recommendation decisions ---------- */

export const decisionsRouter = Router()

decisionsRouter.post('/:id/reject', (req, res) => {
  const input = body(req, { reason: 'string' })
  const rec = recommendation(req.params.id)
  const { tracker } = getWorkspace()
  tracker.rejectRecommendation(rec.actionId, text(input.reason) ?? '')
  send(res, getStore(), tracker.views([rec])[0], DECISION)
})

decisionsRouter.post('/:id/restore', (req, res) => {
  body(req, {})
  const rec = recommendation(req.params.id)
  const { tracker } = getWorkspace()
  tracker.restoreRecommendation(rec.actionId)
  send(res, getStore(), tracker.views([rec])[0], DECISION)
})

/* ---------- Seller memory ---------- */

export const memoryRouter = Router()
const MEMORY_NOTE = 'What you told Mini AI. These are your statements, not facts checked against the data. You can correct or delete any of them.'

memoryRouter.get('/', (req, res) => {
  const store = getStore()
  parseQuery(req, store, [])
  send(res, store, getWorkspace().memory.list(), SELLER, { notes: [MEMORY_NOTE] })
})

memoryRouter.patch('/:id', (req, res) => {
  const input = body(req, { text: 'string' })
  send(res, getStore(), getWorkspace().memory.update(req.params.id, text(input.text) ?? ''), SELLER)
})

memoryRouter.delete('/:id', (req, res) => {
  if (!getWorkspace().memory.remove(req.params.id)) throw notFound('Memory item')
  res.status(204).end()
})

memoryRouter.delete('/', (_req, res) => {
  getWorkspace().memory.clear()
  res.status(204).end()
})

/* ---------- Business review ---------- */

export const reviewRouter = Router()

reviewRouter.get('/', (req, res) => {
  const store = getStore()
  parseQuery(req, store, [])
  const { tracker, memory } = getWorkspace()
  const views = tracker.views(recommendationsWithFindings(store))
  send(res, store, buildBusinessReview(store, views, memory.list()), ['assignment_provided', 'synthetic_demo', 'derived', 'seller_provided'], {
    notes: ['Supported explanations appear in the records alongside the problem; that is not proof they caused it. Hypotheses are not confirmed by the data.'],
  })
})
