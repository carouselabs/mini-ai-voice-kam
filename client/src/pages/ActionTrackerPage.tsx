import { STATUS_TRANSITIONS, TRACKER_STATUSES, type TrackerAction, type TrackerList, type TrackerPriority, type TrackerStatus } from '@shared/tracker.ts'
import { Bot, Check, ChevronDown, Plus, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { StatusBadge } from '@/components/data/status'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/StateViews'
import { Dialog, Field, fieldClass } from '@/components/workspace/Dialog'
import { DUE_DAYS, inDays, PRIORITIES, useMutation } from '@/components/workspace/workspace'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useLiveApi } from '@/hooks/useLiveApi'
import { sendApi } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDate, formatPercent } from '@/lib/format'

type Row = TrackerList['actions'][number]

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'negative' | 'warning' }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3 shadow-card">
      <p className="text-caption text-fg-muted">{label}</p>
      <p className={cn('mt-1 text-metric font-semibold tabular-nums text-fg', tone === 'negative' && 'text-negative', tone === 'warning' && 'text-warning')}>{value}</p>
    </div>
  )
}

const select =
  'h-8 rounded-control border border-line-strong bg-surface px-2.5 text-caption text-fg shadow-card outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-brand-200'

function ActionRow({ action }: { action: Row }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const { run, busy, error } = useMutation()
  const change = (patch: Record<string, string>) => run(() => sendApi<TrackerAction>('PATCH', `/api/tracker/${action.id}`, patch))
  const next = STATUS_TRANSITIONS[action.status]

  return (
    <li data-tracker={action.id} data-status={action.status} className="rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={action.priority} />
            <StatusBadge status={action.status} />
            {action.overdue && <Badge tone="negative">Overdue</Badge>}
            <Badge tone="outline" icon={action.createdBy === 'mini-ai' ? Bot : UserRound}>
              {action.createdBy === 'mini-ai' ? 'Added by Mini AI' : 'Added by you'}
            </Badge>
            {action.recommendationId && <span className="text-2xs text-fg-muted">{action.recommendationId}</span>}
          </div>
          <h3 className="mt-2 text-sm font-semibold text-fg">{action.title}</h3>
          <p className="mt-1 text-2xs text-fg-muted">
            Owner {action.owner} · Due {formatDate(action.dueDate)}
            {action.completedAt && ` · Completed ${formatDate(action.completedAt)}`}
            {action.notes.length > 0 && ` · ${action.notes.length} note${action.notes.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {action.status === 'Awaiting Approval' ? (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void change({ status: 'Rejected' })}>
                Reject
              </Button>
              <Button size="sm" variant="primary" icon={Check} disabled={busy} onClick={() => void run(() => sendApi('POST', `/api/tracker/${action.id}/approve`))}>
                Approve
              </Button>
            </>
          ) : (
            <label className="flex items-center gap-2 text-caption text-fg-muted">
              <span className="sr-only sm:not-sr-only">Status</span>
              <select aria-label={`Status of ${action.title}`} className={select} value={action.status} disabled={busy} onChange={(e) => void change({ status: e.target.value })}>
                <option value={action.status}>{action.status}</option>
                {next.map((s) => (
                  <option key={s} value={s}>
                    {s === 'Approved' && action.status !== 'Rejected' ? 'Back to Approved' : s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button size="sm" variant="ghost" icon={ChevronDown} aria-expanded={open} onClick={() => setOpen((v) => !v)} className={cn('[&>svg]:transition-transform', open && '[&>svg]:rotate-180')}>
            Details
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="px-4 pb-3 text-caption text-negative">
          {error}
        </p>
      )}
      {open && (
        <div className="grid gap-4 border-t border-line p-4 text-caption lg:grid-cols-2">
          <div className="space-y-3">
            {action.description && <p className="text-fg-secondary">{action.description}</p>}
            {action.metricToMonitor && (
              <p>
                <span className="font-semibold text-fg">Metric to monitor: </span>
                <span className="text-fg-secondary">{action.metricToMonitor}</span>
              </p>
            )}
            {action.verification && (
              <p>
                <span className="font-semibold text-fg">How to verify: </span>
                <span className="text-fg-secondary">{action.verification}</span>
              </p>
            )}
            {action.evidence.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-fg-secondary marker:text-fg-subtle">
                {action.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Owner">
                <input
                  className={fieldClass}
                  defaultValue={action.owner}
                  maxLength={80}
                  onBlur={(e) => {
                    const value = e.target.value.trim()
                    if (value && value !== action.owner) void change({ owner: value })
                  }}
                />
              </Field>
              <Field label="Due date">
                <input className={fieldClass} type="date" defaultValue={action.dueDate} onChange={(e) => e.target.value && void change({ dueDate: e.target.value })} />
              </Field>
              <Field label="Priority">
                <select className={fieldClass} value={action.priority} onChange={(e) => void change({ priority: e.target.value })}>
                  {PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Notes</h4>
            {action.notes.length === 0 && <p className="text-fg-muted">No notes yet.</p>}
            <ul className="space-y-2">
              {action.notes.map((n) => (
                <li key={n.at + n.text} className="rounded-control bg-surface-muted px-3 py-2">
                  <p className="text-fg-secondary">{n.text}</p>
                  <p className="mt-0.5 text-2xs text-fg-muted">
                    {n.author === 'mini-ai' ? 'Mini AI' : 'You'} · {formatDate(n.at)}
                  </p>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!note.trim()) return
                const saved = await run(() => sendApi('POST', `/api/tracker/${action.id}/notes`, { text: note.trim() }))
                if (saved !== undefined) setNote('')
              }}
            >
              <input aria-label="Add a note" className={fieldClass} value={note} maxLength={500} placeholder="Add a note" onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" size="md" disabled={busy || !note.trim()}>
                Add
              </Button>
            </form>
            <h4 className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">History</h4>
            <ol className="space-y-1 text-2xs text-fg-muted">
              {action.history.map((h) => (
                <li key={h.at + h.to}>
                  {formatDate(h.at)}: {h.from ? `${h.from} → ${h.to}` : `Created as ${h.to}`}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </li>
  )
}

function NewActionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState('Seller')
  const [priority, setPriority] = useState<TrackerPriority>('Medium')
  const [dueDate, setDueDate] = useState(inDays(DUE_DAYS.Medium))
  const { run, busy, error } = useMutation()
  return (
    <Dialog open={open} onClose={onClose} title="New action" description="An action of your own that is not from a recommendation.">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          const created = await run(() => sendApi('POST', '/api/tracker', { title: title.trim(), owner: owner.trim() || 'Seller', priority, dueDate, approve: true }))
          if (created !== undefined) {
            setTitle('')
            onClose()
          }
        }}
      >
        <Field label="What needs doing">
          <input className={fieldClass} value={title} maxLength={160} required onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Owner">
            <input className={fieldClass} value={owner} maxLength={80} onChange={(e) => setOwner(e.target.value)} />
          </Field>
          <Field label="Due date">
            <input className={fieldClass} type="date" value={dueDate} required onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Priority">
            <select className={fieldClass} value={priority} onChange={(e) => setPriority(e.target.value as TrackerPriority)}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-caption text-negative">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={busy || !title.trim()}>
            Add approved action
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

const ALL = 'All'

export function ActionTrackerPage() {
  useDocumentTitle('Action Tracker')
  const tracker = useLiveApi<TrackerList>('/api/tracker')
  const [status, setStatus] = useState<TrackerStatus | typeof ALL>(ALL)
  const [priority, setPriority] = useState<TrackerPriority | typeof ALL>(ALL)
  const [owner, setOwner] = useState(ALL)
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [creating, setCreating] = useState(false)
  const data = tracker.status === 'success' ? tracker.data : null

  const owners = useMemo(() => [...new Set((data?.actions ?? []).map((a) => a.owner))].sort(), [data])
  const shown = (data?.actions ?? []).filter(
    (a) => (status === ALL || a.status === status) && (priority === ALL || a.priority === priority) && (owner === ALL || a.owner === owner) && (!overdueOnly || a.overdue),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Action Tracker"
        description="Actions you have committed to and how each one is going. Mini AI can suggest an entry, but only you can approve it."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New action
          </Button>
        }
      />
      <Loaded state={tracker} label="action tracker">
        {(list, meta) => (
          <>
            <SourceNote meta={meta}>Saved on this demo server. Mini AI never contacts anyone or changes anything outside this list.</SourceNote>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="tracker-metrics">
              <Metric label="All actions" value={String(list.summary.total)} />
              <Metric label="Awaiting approval" value={String(list.summary.byStatus['Awaiting Approval'])} tone={list.summary.byStatus['Awaiting Approval'] ? 'warning' : undefined} />
              <Metric label="Active" value={String(list.summary.active)} />
              <Metric label="Overdue" value={String(list.summary.overdue)} tone={list.summary.overdue ? 'negative' : undefined} />
              <Metric label="Completed" value={String(list.summary.completed)} />
              <Metric label="Completion rate" value={list.summary.completionRate === null ? '—' : formatPercent(list.summary.completionRate)} />
            </div>
            {list.actions.length === 0 ? (
              <Card>
                <EmptyState
                  title="No actions yet"
                  message="Add a recommendation from AI Recommendations, ask Mini AI to add one for your approval, or create your own."
                />
                <div className="flex justify-center">
                  <ButtonLink to="/recommendations">See recommendations</ButtonLink>
                </div>
              </Card>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-caption" role="group" aria-label="Filters">
                  <select aria-label="Status" className={select} value={status} onChange={(e) => setStatus(e.target.value as TrackerStatus)}>
                    <option value={ALL}>All statuses</option>
                    {TRACKER_STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <select aria-label="Priority" className={select} value={priority} onChange={(e) => setPriority(e.target.value as TrackerPriority)}>
                    <option value={ALL}>All priorities</option>
                    {PRIORITIES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                  <select aria-label="Owner" className={select} value={owner} onChange={(e) => setOwner(e.target.value)}>
                    <option value={ALL}>All owners</option>
                    {owners.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                  <label className="inline-flex items-center gap-2 text-fg-secondary">
                    <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
                    Overdue only
                  </label>
                  <span className="ml-auto text-fg-muted">
                    {shown.length} of {list.actions.length}
                  </span>
                </div>
                {shown.length === 0 ? (
                  <EmptyState title="Nothing matches" message="Try other filters." />
                ) : (
                  <ul className="space-y-3">
                    {shown.map((a) => (
                      <ActionRow key={a.id} action={a} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </Loaded>
      <NewActionDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
