/**
 * The chat's opening message, built straight from the verified figures. It shows the moment the assistant opens:
 * the account checks take about 35 ms, while a model-written greeting took 5–16 s and cost a model call every time.
 */
import { formatCurrency, formatPercent } from '../../../shared/format.ts'
import type { Store } from '../data/store.ts'
import { contextFor } from '../insights/context.ts'
import { trackerList } from '../workspace/index.ts'

/** Findings shown as evidence cards under the greeting (what it says), in this order when present. */
export const GREETING_FINDINGS = ['FIND-SD-01', 'FIND-SD-02']

export function openingGreeting(store: Store): string {
  const ctx = contextFor(store)
  const m = store.facts.metrics
  const sales = ctx.revenue.facts.sales
  const down = (sales.percentChange ?? 0) < 0
  const samePrice = m.averageSellingPrice.previous === m.averageSellingPrice.current
  // The brief: greet, then understand why the seller is calling. Mini AI has already looked, so it names the one
  // big thing in plain words and asks; the causes come in the conversation, once the seller says what they need.
  const parts = ['Hi! I’m Mini AI, your account manager. I’ve already checked your numbers.']
  parts.push(
    `Sales are ${down ? 'down' : 'up'} ${formatPercent(Math.abs(sales.percentChange ?? 0))} this month, about ${formatCurrency(Math.abs(sales.change))}` +
      (down && samePrice ? '. Your prices didn’t change, so it’s fewer orders coming in.' : '.'),
  )
  const { actions } = trackerList()
  const overdue = actions.filter((a) => a.overdue).length
  const waiting = actions.filter((a) => a.status === 'Awaiting Approval').length
  if (overdue) parts.push(`Also, ${overdue === 1 ? 'one action on your tracker is' : `${overdue} actions on your tracker are`} overdue.`)
  else if (waiting) parts.push(`Also, ${waiting === 1 ? 'one action is' : `${waiting} actions are`} waiting for your approval in the tracker.`)
  parts.push(down ? 'Is that why you’re calling, or is something else on your mind?' : 'What’s on your mind today?')
  return parts.join(' ')
}
