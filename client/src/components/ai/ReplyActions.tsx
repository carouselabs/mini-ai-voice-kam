import type { ActionCard, TrackerCard } from '@shared/ai.ts'
import type { RecommendationView, TrackerList } from '@shared/tracker.ts'
import { ArrowRight, Check, ListPlus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { StatusBadge } from '@/components/data/status'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { AddToTrackerDialog, type TrackerSource } from '@/components/workspace/AddToTrackerDialog'
import { STATE_LABEL, TRACKER_PRIORITY, useMutation } from '@/components/workspace/workspace'
import { useLiveApi } from '@/hooks/useLiveApi'
import { sendApi } from '@/lib/api'
import { formatDate } from '@/lib/format'

/** An entry Mini AI added this turn. It stays "Awaiting Approval" until the seller presses Approve. */
function ApprovalCard({ card, live, onNavigate }: { card: TrackerCard; live: TrackerList['actions'][number] | undefined; onNavigate: () => void }) {
  const { run, busy, error } = useMutation()
  const status = live?.status ?? card.status
  return (
    <article data-testid="approval-card" data-tracker={card.id} data-status={status} className="rounded-control border border-warning/30 bg-warning-soft/40 p-3 text-caption">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={status} />
        <StatusBadge status={card.priority} />
      </div>
      <p className="mt-1.5 font-semibold text-fg">{card.title}</p>
      <p className="text-2xs text-fg-muted">
        Owner {live?.owner ?? card.owner} · Due {formatDate(live?.dueDate ?? card.dueDate)}
      </p>
      {status === 'Awaiting Approval' ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" icon={Check} disabled={busy} onClick={() => void run(() => sendApi('POST', `/api/tracker/${card.id}/approve`))}>
            Approve
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => sendApi('PATCH', `/api/tracker/${card.id}`, { status: 'Rejected' }))}>
            Reject
          </Button>
          <span className="text-2xs text-fg-muted">Mini AI added this; only you can approve it.</span>
        </div>
      ) : (
        <Link to="/actions" onClick={onNavigate} className="mt-2 inline-flex items-center gap-1 text-2xs font-medium text-brand-700 hover:underline">
          Open Action Tracker <ArrowRight aria-hidden className="size-3" />
        </Link>
      )}
      {error && (
        <p role="alert" className="mt-1 text-2xs text-negative">
          {error}
        </p>
      )}
    </article>
  )
}

function RecommendationCard({ card, live, onAdd, onNavigate }: { card: ActionCard; live: RecommendationView | undefined; onAdd: () => void; onNavigate: () => void }) {
  const state = live?.state ?? card.state
  return (
    <article data-testid="action-card" data-action={card.actionId} data-state={state} className="rounded-control border border-line bg-surface p-3 text-caption">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={TRACKER_PRIORITY[card.priority]} />
        <Badge tone="outline">{STATE_LABEL[state]}</Badge>
      </div>
      <p className="mt-1.5 font-semibold text-fg">{card.title}</p>
      {card.caution && <p className="mt-0.5 text-2xs font-medium text-warning">Check first: {card.caution}</p>}
      <p className="text-2xs text-fg-muted">Then watch: {card.metricToMonitor}</p>
      <div className="mt-2">
        {state === 'proposed' ? (
          <Button size="sm" icon={ListPlus} onClick={onAdd}>
            Add to tracker
          </Button>
        ) : state === 'rejected' ? (
          <span className="text-2xs text-fg-muted">You rejected this{live?.rejectionReason ? `: ${live.rejectionReason}` : ''}.</span>
        ) : (
          <Link to="/actions" onClick={onNavigate} className="inline-flex items-center gap-1 text-2xs font-medium text-brand-700 hover:underline">
            {state === 'awaiting_approval' ? 'Approve in Action Tracker' : 'Open Action Tracker'} <ArrowRight aria-hidden className="size-3" />
          </Link>
        )}
      </div>
    </article>
  )
}

/** Recommendations and tracker entries from one reply, with their current state from the server. */
export function ReplyActions({ actions, tracker, onNavigate }: { actions: ActionCard[]; tracker: TrackerCard[]; onNavigate: () => void }) {
  const recs = useLiveApi<RecommendationView[]>('/api/actions/recommendations')
  const list = useLiveApi<TrackerList>('/api/tracker')
  const [adding, setAdding] = useState<TrackerSource | null>(null)
  const recOf = (id: string) => (recs.status === 'success' ? recs.data.find((r) => r.actionId === id) : undefined)
  const entryOf = (id: string) => (list.status === 'success' ? list.data.actions.find((a) => a.id === id) : undefined)

  return (
    <div className="space-y-2">
      {tracker.map((card) => (
        <ApprovalCard key={card.id} card={card} live={entryOf(card.id)} onNavigate={onNavigate} />
      ))}
      {actions.length > 0 && (
        <>
          <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">What you could do</p>
          {actions.map((card) => (
            <RecommendationCard
              key={card.actionId}
              card={card}
              live={recOf(card.actionId)}
              onNavigate={onNavigate}
              onAdd={() => setAdding({ actionId: card.actionId, title: card.title, priority: card.priority, suggestedOwner: card.owner, metricToMonitor: card.metricToMonitor })}
            />
          ))}
        </>
      )}
      <AddToTrackerDialog source={adding} onClose={() => setAdding(null)} />
    </div>
  )
}
