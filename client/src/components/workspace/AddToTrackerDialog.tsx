import type { TrackerAction, TrackerPriority } from '@shared/tracker.ts'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { sendApi } from '@/lib/api'
import { Dialog, Field, fieldClass } from './Dialog'
import { DUE_DAYS, inDays, PRIORITIES, TRACKER_PRIORITY, useMutation } from './workspace'

export interface TrackerSource {
  actionId: string
  title: string
  priority: keyof typeof TRACKER_PRIORITY
  suggestedOwner: string
  metricToMonitor: string
}

/**
 * Adds a recommendation to the tracker. The seller chooses owner, due date and priority, then
 * either approves it now or leaves it awaiting approval. Nothing is added without this step.
 */
export function AddToTrackerDialog({ source, onClose }: { source: TrackerSource | null; onClose: () => void }) {
  return (
    <Dialog
      open={source !== null}
      onClose={onClose}
      title="Add to your action tracker"
      description="Your own to-do list. Mini AI does not contact anyone or change anything for you."
    >
      {source && <Form key={source.actionId} source={source} onClose={onClose} />}
    </Dialog>
  )
}

function Form({ source, onClose }: { source: TrackerSource; onClose: () => void }) {
  const initialPriority = TRACKER_PRIORITY[source.priority]
  const [owner, setOwner] = useState(source.suggestedOwner)
  const [priority, setPriority] = useState<TrackerPriority>(initialPriority)
  const [dueDate, setDueDate] = useState(inDays(DUE_DAYS[initialPriority]))
  const [note, setNote] = useState('')
  const { run, busy, error } = useMutation()

  const submit = async (approve: boolean) => {
    const created = await run(() =>
      sendApi<TrackerAction>('POST', '/api/tracker', {
        recommendationId: source.actionId,
        owner: owner.trim() || 'Seller',
        priority,
        dueDate,
        approve,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    )
    if (created) onClose()
  }

  return (
    <form
      data-testid="add-to-tracker"
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(true)
      }}
    >
      <p className="rounded-control bg-surface-muted px-3 py-2 text-caption">
        <span className="font-semibold text-fg">{source.title}</span>
        <span className="mt-0.5 block text-fg-muted">Then watch: {source.metricToMonitor}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Owner">
          <input className={fieldClass} value={owner} maxLength={80} onChange={(e) => setOwner(e.target.value)} required />
        </Field>
        <Field label="Due date">
          <input className={fieldClass} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </Field>
        <Field label="Priority">
          <select className={fieldClass} value={priority} onChange={(e) => setPriority(e.target.value as TrackerPriority)}>
            {PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Note (optional)">
          <input className={fieldClass} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-caption text-negative">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={() => void submit(false)} disabled={busy}>
          Add, approve later
        </Button>
        <Button variant="primary" type="submit" disabled={busy}>
          Approve and add
        </Button>
      </div>
    </form>
  )
}
