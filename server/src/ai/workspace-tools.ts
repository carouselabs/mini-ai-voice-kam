/**
 * Tools that touch the seller's workspace. Mini AI can read the tracker and memory, add a
 * recommended action as "Awaiting Approval" when the seller asks, and note what the seller said.
 * It can never approve, start, complete or reject a tracker action.
 */
import type { SellerMemoryItem, TrackerAction } from '../../../shared/tracker.ts'
import type { Store } from '../data/store.ts'
import { HttpError } from '../http/respond.ts'
import { buildBusinessReview } from '../insights/review.ts'
import { recommendationsWithFindings } from '../investigations/index.ts'
import type { getRecommendedActions } from '../services/kam-data.ts'
import { getWorkspace, trackerList } from '../workspace/index.ts'

/** Recommendations with where each stands; rejected and completed ones are listed apart so they are not proposed again. */
export function withStates(result: ReturnType<typeof getRecommendedActions>, store: Store) {
  if (!('data' in result)) return result
  const views = new Map(getWorkspace().tracker.views(recommendationsWithFindings(store)).map((v) => [v.actionId, v]))
  const all = result.data.map((a) => ({ ...a, state: views.get(a.actionId)?.state ?? 'proposed', rejectionReason: views.get(a.actionId)?.rejectionReason ?? null }))
  const closed = (a: (typeof all)[number]) => a.state === 'rejected' || a.state === 'completed'
  return {
    ...result,
    data: all.filter((a) => !closed(a)),
    rejectedOrCompleted: all.filter(closed).map((a) => ({ actionId: a.actionId, title: a.title, state: a.state, rejectionReason: a.rejectionReason })),
  }
}

export function businessReview(store: Store) {
  const { tracker, memory } = getWorkspace()
  const { investigations, opportunities, ...summary } = buildBusinessReview(store, tracker.views(recommendationsWithFindings(store)), memory.list())
  return {
    data: {
      ...summary,
      // Split by evidence so the wording follows it: unproven ideas are said with "might".
      supportedOpportunities: opportunities.filter((o) => o.basis === 'supported'),
      unprovenIdeas: opportunities
        .filter((o) => o.basis === 'hypothesis')
        .map((o) => ({ ...o, sayItAs: 'might help; the data has not shown it yet' })),
      // The full structured investigations are for the page; the model gets the headlines.
      investigationHeadlines: investigations.map((i) => ({ question: i.question, headline: i.headline })),
    },
  }
}

export function trackerForModel() {
  const { actions, summary, today } = trackerList()
  return {
    data: {
      today,
      summary,
      actions: actions.map((a) => ({
        id: a.id,
        recommendationId: a.recommendationId,
        title: a.title,
        status: a.status,
        priority: a.priority,
        owner: a.owner,
        dueDate: a.dueDate,
        overdue: a.overdue,
        createdBy: a.createdBy,
        latestNote: a.notes.at(-1)?.text ?? null,
      })),
    },
  }
}

export function proposeAction(recommendationId: string, note: string | null, store: Store): { proposed: TrackerAction; message: string } | { error: string } {
  const rec = recommendationsWithFindings(store).find((r) => r.actionId === recommendationId)
  if (!rec) return { error: `Recommendation ${recommendationId} is not in the current list.` }
  try {
    const proposed = getWorkspace().tracker.create(rec, { approve: false, createdBy: 'mini-ai', note: note ?? undefined })
    return { proposed, message: 'Added as Awaiting Approval. The seller approves it on screen; you cannot.' }
  } catch (error) {
    if (error instanceof HttpError) return { error: error.message }
    throw error
  }
}

export function remember(args: Record<string, unknown>): { saved: SellerMemoryItem; message: string } {
  const saved = getWorkspace().memory.add({
    kind: String(args.kind),
    topic: String(args.topic),
    text: String(args.text),
    productIds: Array.isArray(args.productIds) ? args.productIds.map(String) : [],
  })
  return { saved, message: 'Saved as the seller’s own statement, not verified by the data. The seller can correct or delete it in Settings.' }
}

export function sellerContext(store: Store) {
  const { tracker, memory } = getWorkspace()
  const views = tracker.views(recommendationsWithFindings(store))
  return {
    data: {
      note: 'Seller statements are what the seller said. They are not verified by the data.',
      sellerStatements: memory.list().map(({ id, kind, topic, text, createdAt }) => ({ id, kind, topic, text, createdAt })),
      rejectedRecommendations: views.filter((v) => v.state === 'rejected').map((v) => ({ actionId: v.actionId, title: v.title, reason: v.rejectionReason })),
      openTrackerActions: tracker
        .list()
        .filter((a) => a.status !== 'Completed' && a.status !== 'Rejected')
        .map((a) => ({ id: a.id, title: a.title, status: a.status, owner: a.owner, dueDate: a.dueDate })),
    },
  }
}

/** True when there is anything saved that Mini AI should know at the start of a session. */
export function hasSellerContext(store: Store): boolean {
  const { data } = sellerContext(store)
  return data.sellerStatements.length > 0 || data.rejectedRecommendations.length > 0 || data.openTrackerActions.length > 0
}
