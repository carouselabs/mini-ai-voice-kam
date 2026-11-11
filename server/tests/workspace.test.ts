import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'

// The tracker and memory are saved to disk; tests use a throwaway folder.
const dir = mkdtempSync(path.join(tmpdir(), 'mini-ai-workspace-'))
process.env.MINI_AI_RUNTIME_DIR = dir

const { createApp } = await import('../src/app.ts')
const { getWorkspace } = await import('../src/workspace/index.ts')
const { TrackerService } = await import('../src/workspace/tracker.ts')

let base = ''
let close: () => void = () => {}

before(async () => {
  const server = createApp().listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  close = () => server.close()
})
after(() => {
  close()
  rmSync(dir, { recursive: true, force: true })
})

// oxlint-disable-next-line typescript/no-explicit-any
type Json = any

async function call(method: string, url: string, body?: unknown): Promise<{ status: number; body: Json }> {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

const state = async (id: string) => (await call('GET', '/actions/recommendations')).body.data.find((r: Json) => r.actionId === id).state

describe('action tracker', () => {
  let id = ''

  test('starts empty and every recommendation is only proposed', async () => {
    const { body } = await call('GET', '/tracker')
    assert.equal(body.data.actions.length, 0)
    assert.equal(body.data.summary.total, 0)
    assert.equal(body.data.summary.completionRate, null)
    assert.deepEqual(body.meta.sourceTypes, ['seller_provided'])
    const recs = (await call('GET', '/actions/recommendations')).body.data
    assert.ok(recs.length >= 10)
    assert.ok(recs.every((r: Json) => r.state === 'proposed' && r.metricToMonitor && r.verification && r.problem))
  })

  test('adding a recommendation without approval leaves it awaiting approval', async () => {
    const { status, body } = await call('POST', '/tracker', { recommendationId: 'ACT-001' })
    assert.equal(status, 201)
    const action = body.data
    id = action.id
    assert.equal(action.status, 'Awaiting Approval')
    assert.equal(action.priority, 'Critical')
    assert.equal(action.createdBy, 'seller')
    assert.equal(action.approvedAt, null)
    assert.ok(action.metricToMonitor && action.verification && action.evidence.length)
    assert.equal(await state('ACT-001'), 'awaiting_approval')
  })

  test('the same recommendation cannot be added twice while open', async () => {
    const { status, body } = await call('POST', '/tracker', { recommendationId: 'ACT-001' })
    assert.equal(status, 409)
    assert.equal(body.error.code, 'conflict')
  })

  test('status changes follow the allowed transitions', async () => {
    const bad = await call('PATCH', `/tracker/${id}`, { status: 'Completed' })
    assert.equal(bad.status, 400)
    const approved = await call('POST', `/tracker/${id}/approve`)
    assert.equal(approved.body.data.status, 'Approved')
    assert.ok(approved.body.data.approvedAt)
    const started = await call('PATCH', `/tracker/${id}`, { status: 'In Progress', owner: 'Ravi (warehouse)' })
    assert.equal(started.body.data.status, 'In Progress')
    assert.equal(started.body.data.owner, 'Ravi (warehouse)')
    assert.deepEqual(started.body.data.history.map((h: Json) => h.to), ['Awaiting Approval', 'Approved', 'In Progress'])
    assert.equal(await state('ACT-001'), 'in_tracker')
  })

  test('a past due date makes an active action overdue', async () => {
    await call('PATCH', `/tracker/${id}`, { dueDate: '2026-01-01' })
    const { body } = await call('GET', '/tracker')
    assert.equal(body.data.actions[0].overdue, true)
    assert.equal(body.data.summary.overdue, 1)
    assert.equal(body.data.summary.active, 1)
  })

  test('notes are kept with the action', async () => {
    const { body } = await call('POST', `/tracker/${id}/notes`, { text: 'Supplier confirmed delivery for Friday.' })
    assert.equal(body.data.notes.at(-1).text, 'Supplier confirmed delivery for Friday.')
    assert.equal(body.data.notes.at(-1).author, 'seller')
  })

  test('completing sets the completion date and is no longer overdue', async () => {
    const { body } = await call('PATCH', `/tracker/${id}`, { status: 'Completed' })
    assert.equal(body.data.status, 'Completed')
    assert.ok(body.data.completedAt)
    const list = (await call('GET', '/tracker')).body.data
    assert.equal(list.actions[0].overdue, false)
    assert.equal(list.summary.completed, 1)
    assert.equal(list.summary.completionRate, 1)
    assert.equal(await state('ACT-001'), 'completed')
  })

  test('a custom action needs a title and can be approved when created', async () => {
    assert.equal((await call('POST', '/tracker', {})).status, 400)
    const { body } = await call('POST', '/tracker', { title: 'Call the courier about damaged parcels', priority: 'Medium', approve: true })
    assert.equal(body.data.status, 'Approved')
    assert.equal(body.data.recommendationId, null)
  })

  test('bad input is rejected', async () => {
    assert.equal((await call('POST', '/tracker', { recommendationId: 'ACT-999' })).status, 404)
    assert.equal((await call('POST', '/tracker', { recommendationId: 'ACT-002', priority: 'Urgent' })).status, 400)
    assert.equal((await call('POST', '/tracker', { recommendationId: 'ACT-002', dueDate: '10/11/2026' })).status, 400)
    assert.equal((await call('POST', '/tracker', { recommendationId: 'ACT-002', hack: true })).status, 400)
    assert.equal((await call('POST', '/tracker', { recommendationId: 'ACT-002', approve: 'yes' })).status, 400)
    assert.equal((await call('PATCH', '/tracker/TRK-NOPE', { status: 'Approved' })).status, 404)
    assert.equal((await call('PATCH', `/tracker/${id}`, { status: 'Done' })).status, 400)
    assert.equal((await call('POST', `/tracker/${id}/notes`, { text: '   ' })).status, 400)
  })

  test('the tracker survives a restart', () => {
    const fresh = new TrackerService()
    const saved = fresh.list()
    assert.equal(saved.length, 2)
    assert.equal(saved.find((a) => a.id === id)?.status, 'Completed')
  })
})

describe('recommendation decisions', () => {
  test('rejecting hides a recommendation from the plan; restoring brings it back', async () => {
    const rejected = await call('POST', '/actions/recommendations/ACT-010/reject', { reason: 'Price is set by the brand' })
    assert.equal(rejected.body.data.state, 'rejected')
    assert.equal(rejected.body.data.rejectionReason, 'Price is set by the brand')
    const plan = (await call('GET', '/review')).body.data.actionPlan
    assert.ok(!plan.some((a: Json) => a.actionId === 'ACT-010' || a.actionId === 'ACT-001'))
    const restored = await call('POST', '/actions/recommendations/ACT-010/restore')
    assert.equal(restored.body.data.state, 'proposed')
    assert.equal((await call('POST', '/actions/recommendations/ACT-999/reject', { reason: 'x' })).status, 404)
  })
})

describe('seller memory', () => {
  test('lists, corrects and deletes what the seller said', async () => {
    const { memory } = getWorkspace()
    const item = memory.add({ kind: 'seller_statement', topic: 'PRD-016 price', text: 'The speaker price was raised because the supplier cost went up.', productIds: ['PRD-016'] })
    memory.add({ kind: 'preference', topic: 'language', text: 'Prefers short answers in Hindi.' })

    const list = await call('GET', '/memory')
    assert.equal(list.body.data.length, 2)
    assert.ok(list.body.data.every((i: Json) => i.source === 'seller' && i.verifiedBySystem === false))
    assert.match(list.body.meta.notes[0], /not facts checked/)

    const fixed = await call('PATCH', `/memory/${item.id}`, { text: 'The speaker price was raised by the brand.' })
    assert.equal(fixed.body.data.text, 'The speaker price was raised by the brand.')

    assert.equal((await call('DELETE', `/memory/${item.id}`)).status, 204)
    assert.equal((await call('DELETE', `/memory/${item.id}`)).status, 404)
    assert.equal((await call('GET', '/memory')).body.data.length, 1)
    assert.equal((await call('DELETE', '/memory')).status, 204)
    assert.equal((await call('GET', '/memory')).body.data.length, 0)
  })

  test('the same topic and kind replaces the older statement', () => {
    const { memory } = getWorkspace()
    memory.add({ kind: 'decision', topic: 'Earbuds', text: 'Will inspect before reordering.' })
    memory.add({ kind: 'decision', topic: 'earbuds', text: 'Stopped selling the earbuds.' })
    const items = memory.list().filter((i) => i.topic.toLowerCase() === 'earbuds')
    assert.equal(items.length, 1)
    assert.equal(items[0].text, 'Stopped selling the earbuds.')
    memory.clear()
  })
})

describe('business review', () => {
  test('health, risks, opportunities, a three-item plan and structured investigations', async () => {
    const { body } = await call('GET', '/review')
    const review = body.data
    assert.equal(review.health.kpis.length, 6)
    assert.ok(review.health.onTimeDelivery.current < review.health.onTimeDelivery.previous)
    assert.ok(review.risks.length >= 3 && review.risks.length <= 5)
    assert.equal(review.risks[0].severity, 'critical')
    assert.ok(review.opportunities.length >= 2)
    assert.ok(review.opportunities.every((o: Json) => o.basis === 'supported' || o.basis === 'hypothesis'))
    assert.ok(review.opportunities.some((o: Json) => o.basis === 'hypothesis'), 'unproven upside is labelled a hypothesis')
    assert.equal(review.actionPlan.length, 3)
    assert.ok(review.actionPlan.every((a: Json) => a.metricToMonitor && a.owner && a.evidence.length))
    assert.equal(review.investigations.length, 6)
    for (const inv of review.investigations) {
      for (const f of inv.findings) {
        assert.ok(f.problem && f.businessImpact && f.nextInvestigation && f.link, f.findingId)
        assert.ok(Array.isArray(f.verifiedFacts) && f.verifiedFacts.length, f.findingId)
        assert.ok(Array.isArray(f.supportedExplanations) && Array.isArray(f.hypotheses))
      }
    }
    assert.match(body.meta.notes[0], /not proof/)
  })
})
