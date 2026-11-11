import type { TrackerList } from '../../../shared/tracker.ts'
import { SellerMemory } from './memory.ts'
import { isOverdue, TrackerService } from './tracker.ts'

let tracker: TrackerService | null = null
let memory: SellerMemory | null = null

/** The seller's saved workspace: action tracker and the things they told Mini AI. */
export function getWorkspace() {
  tracker ??= new TrackerService()
  memory ??= new SellerMemory()
  return { tracker, memory }
}

/** Every tracker action with its overdue flag, plus progress totals. */
export function trackerList(): TrackerList {
  const { tracker } = getWorkspace()
  const today = new Date().toISOString().slice(0, 10)
  const actions = tracker.list()
  return { actions: actions.map((a) => ({ ...a, overdue: isOverdue(a, today) })), summary: tracker.summary(actions), today }
}
