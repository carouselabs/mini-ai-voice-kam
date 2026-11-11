import type { RecommendationView } from '@shared/tracker.ts'
import { CalendarClock, ListPlus, MessageCircleQuestion, RotateCcw, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { useAssistant } from '@/app/providers/assistant-context'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { StatusBadge } from '@/components/data/status'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { EmptyState } from '@/components/ui/StateViews'
import { AddToTrackerDialog, type TrackerSource } from '@/components/workspace/AddToTrackerDialog'
import { Dialog, Field, fieldClass } from '@/components/workspace/Dialog'
import { DUE_DAYS, STATE_LABEL, TRACKER_PRIORITY, useMutation } from '@/components/workspace/workspace'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useLiveApi } from '@/hooks/useLiveApi'
import { sendApi } from '@/lib/api'

const STATE_TONE = { proposed: 'neutral', awaiting_approval: 'warning', in_tracker: 'brand', completed: 'positive', rejected: 'outline' } as const

function ActionCard({ action, onAdd, onReject }: { action: RecommendationView; onAdd: () => void; onReject: () => void }) {
  const { openAssistant } = useAssistant()
  const { run, busy, error } = useMutation()
  const priority = TRACKER_PRIORITY[action.priority]
  return (
    <article data-action={action.actionId} data-state={action.state} className="flex flex-col rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={priority} />
        <Badge tone="outline">{action.category}</Badge>
        <span className="text-2xs text-fg-muted">{action.actionId}</span>
        <Badge tone={STATE_TONE[action.state]} className="ml-auto" data-testid="recommendation-state">
          {STATE_LABEL[action.state]}
        </Badge>
      </div>
      <h2 className="mt-3 text-[0.9375rem] font-semibold text-fg">{action.title}</h2>
      <p className="mt-1 text-caption text-fg-muted">
        <span className="font-medium text-fg-secondary">Problem: </span>
        {action.problem}
      </p>
      <p className="mt-2 text-sm text-fg-secondary">{action.description}</p>
      {action.caution && (
        <p data-testid="caution" className="mt-2 rounded-control bg-warning-soft px-3 py-2 text-caption text-warning">
          <span className="font-semibold">Check first: </span>
          {action.caution}
        </p>
      )}
      <p className="mt-3 rounded-control bg-surface-muted px-3 py-2 text-caption text-fg-secondary">
        <span className="font-semibold text-fg">Why it matters: </span>
        {action.businessImpact}
      </p>
      <h3 className="mt-4 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Evidence</h3>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-caption text-fg-secondary marker:text-fg-subtle">
        {action.supportingEvidence.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <dl className="mt-3 grid gap-2 text-caption sm:grid-cols-2">
        <div>
          <dt className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Metric to monitor</dt>
          <dd className="mt-0.5 text-fg-secondary">{action.metricToMonitor}</dd>
        </div>
        <div>
          <dt className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">How to verify</dt>
          <dd className="mt-0.5 text-fg-secondary">{action.verification}</dd>
        </div>
      </dl>
      {action.state === 'rejected' && action.rejectionReason && (
        <p className="mt-3 text-caption text-fg-muted">
          <span className="font-medium text-fg-secondary">You rejected this: </span>
          {action.rejectionReason}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-caption text-negative">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-1 flex-wrap items-end gap-x-4 gap-y-2 border-t border-line pt-3 text-2xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <UserRound aria-hidden className="size-3.5" /> Suggested owner: {action.suggestedOwner}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock aria-hidden className="size-3.5" /> Suggested within {DUE_DAYS[priority]} days
        </span>
        <span>{action.findingIds.length} supporting findings</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            icon={MessageCircleQuestion}
            aria-label={`Ask Mini AI about “${action.title}”`}
            onClick={() => openAssistant(`Tell me more about this recommendation: ${action.title}`)}
          >
            Ask
          </Button>
          {action.state === 'proposed' && (
            <>
              <Button size="sm" variant="ghost" icon={X} onClick={onReject}>
                Reject
              </Button>
              <Button size="sm" variant="primary" icon={ListPlus} onClick={onAdd}>
                Add to tracker
              </Button>
            </>
          )}
          {action.state === 'rejected' && (
            <Button size="sm" icon={RotateCcw} disabled={busy} onClick={() => void run(() => sendApi('POST', `/api/actions/recommendations/${action.actionId}/restore`))}>
              Restore
            </Button>
          )}
          {action.state !== 'proposed' && action.state !== 'rejected' && (
            <ButtonLink size="sm" to="/actions">
              Open in tracker
            </ButtonLink>
          )}
        </div>
      </div>
    </article>
  )
}

function RejectDialog({ action, onClose }: { action: RecommendationView | null; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const { run, busy, error } = useMutation()
  return (
    <Dialog
      open={action !== null}
      onClose={onClose}
      title="Reject this recommendation?"
      description="Mini AI will not suggest it again unless new evidence changes it. You can restore it later."
    >
      {action && (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault()
            const done = await run(() => sendApi('POST', `/api/actions/recommendations/${action.actionId}/reject`, { reason: reason.trim() }))
            if (done !== undefined) {
              setReason('')
              onClose()
            }
          }}
        >
          <p className="text-sm font-medium text-fg">{action.title}</p>
          <Field label="Why? (optional, helps Mini AI)">
            <input className={fieldClass} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The brand sets this price" />
          </Field>
          {error && (
            <p role="alert" className="text-caption text-negative">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={busy}>
              Reject
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

type View = 'open' | 'closed'

export function RecommendationsPage() {
  useDocumentTitle('AI Recommendations')
  const actions = useLiveApi<RecommendationView[]>('/api/actions/recommendations')
  const [view, setView] = useState<View>('open')
  const [adding, setAdding] = useState<TrackerSource | null>(null)
  const [rejecting, setRejecting] = useState<RecommendationView | null>(null)

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Recommendations"
        description="Prioritised actions from Mini AI’s investigation of your store data, with the evidence behind each one. Nothing happens until you approve it."
        actions={
          <SegmentedControl
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { id: 'open', label: 'Open' },
              { id: 'closed', label: 'Completed & rejected' },
            ]}
          />
        }
      />
      <Loaded state={actions} label="recommendations">
        {(list, meta) => {
          const closed = (a: RecommendationView) => a.state === 'completed' || a.state === 'rejected'
          const shown = list.filter((a) => (view === 'open' ? !closed(a) : closed(a)))
          return (
            <>
              <SourceNote meta={meta}>
                These are recommendations only. Mini AI does not contact suppliers, warehouse teams, customers or couriers, and does not change listings, prices or stock.
              </SourceNote>
              {shown.length === 0 ? (
                <EmptyState
                  title={view === 'open' ? 'No open recommendations' : 'Nothing completed or rejected yet'}
                  message={view === 'open' ? 'Every recommendation is completed or rejected.' : 'Recommendations you complete in the tracker or reject appear here.'}
                />
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {shown.map((action) => (
                    <ActionCard key={action.actionId} action={action} onAdd={() => setAdding(action)} onReject={() => setRejecting(action)} />
                  ))}
                </div>
              )}
            </>
          )
        }}
      </Loaded>
      <AddToTrackerDialog source={adding} onClose={() => setAdding(null)} />
      <RejectDialog action={rejecting} onClose={() => setRejecting(null)} />
    </div>
  )
}
