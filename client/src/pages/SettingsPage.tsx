import type { SellerMemoryItem } from '@shared/tracker.ts'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useAssistant } from '@/app/providers/assistant-context'
import { Loaded } from '@/components/data/Loaded'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/IconButton'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { fieldClass } from '@/components/workspace/Dialog'
import { useMutation } from '@/components/workspace/workspace'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useLiveApi } from '@/hooks/useLiveApi'
import { sendApi } from '@/lib/api'
import { formatDate } from '@/lib/format'

const KIND_LABEL: Record<SellerMemoryItem['kind'], string> = {
  seller_statement: 'Something you said',
  preference: 'Preference',
  decision: 'Decision',
  open_question: 'Open question',
}

function MemoryItem({ item }: { item: SellerMemoryItem }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.text)
  const { run, busy, error } = useMutation()
  return (
    <li data-memory={item.id} className="py-3 text-caption">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="outline">{KIND_LABEL[item.kind]}</Badge>
        <span className="font-medium text-fg">{item.topic}</span>
        <span className="text-2xs text-fg-muted">· {formatDate(item.createdAt)} · Not verified by the data</span>
        <span className="ml-auto flex gap-1">
          {!editing && <IconButton icon={Pencil} label={`Correct “${item.topic}”`} size="sm" tooltip={false} onClick={() => setEditing(true)} />}
          <IconButton icon={Trash2} label={`Delete “${item.topic}”`} size="sm" tooltip={false} disabled={busy} onClick={() => void run(() => sendApi('DELETE', `/api/memory/${item.id}`))} />
        </span>
      </div>
      {editing ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const saved = await run(() => sendApi('PATCH', `/api/memory/${item.id}`, { text: text.trim() }))
            if (saved !== undefined) setEditing(false)
          }}
        >
          <input aria-label="Corrected text" className={fieldClass} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
          <IconButton icon={Check} label="Save" variant="secondary" tooltip={false} type="submit" disabled={busy || !text.trim()} />
          <IconButton
            icon={X}
            label="Cancel"
            tooltip={false}
            onClick={() => {
              setText(item.text)
              setEditing(false)
            }}
          />
        </form>
      ) : (
        <p className="mt-1 text-fg-secondary">{item.text}</p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-negative">
          {error}
        </p>
      )}
    </li>
  )
}

export function SettingsPage() {
  useDocumentTitle('Settings')
  const { voice, toggleMute, setVoiceLanguage } = useAssistant()
  const memory = useLiveApi<SellerMemoryItem[]>('/api/memory')
  const { run, busy } = useMutation()

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="How Mini AI talks to you, and what it remembers from your conversations." />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Assistant" description="Saved in this browser">
          <div className="space-y-4 text-caption">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-fg">Read answers aloud</p>
                <p className="text-fg-muted">{voice.synthesisSupported ? 'Uses your browser’s voice.' : 'Not supported in this browser.'}</p>
              </div>
              <SegmentedControl
                label="Read answers aloud"
                value={voice.muted ? 'off' : 'on'}
                onChange={(v) => {
                  if ((v === 'off') !== voice.muted) toggleMute()
                }}
                options={[
                  { id: 'on', label: 'On' },
                  { id: 'off', label: 'Off' },
                ]}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-fg">Speaking language</p>
                <p className="text-fg-muted">{voice.recognitionSupported ? 'For the microphone. Mini AI replies in the language you use.' : 'Voice input is not supported in this browser.'}</p>
              </div>
              <SegmentedControl
                label="Speaking language"
                value={voice.language}
                onChange={setVoiceLanguage}
                options={[
                  { id: 'en-IN', label: 'English' },
                  { id: 'hi-IN', label: 'हिन्दी' },
                ]}
              />
            </div>
          </div>
        </Card>
        <Card
          className="xl:col-span-2"
          title="What Mini AI remembers"
          description="Things you told Mini AI that the data cannot show. They are your statements, never treated as verified facts. Correct or delete any of them."
          actions={
            memory.status === 'success' && memory.data.length > 0 ? (
              <Button size="sm" variant="ghost" icon={Trash2} disabled={busy} onClick={() => void run(() => sendApi('DELETE', '/api/memory'))}>
                Forget everything
              </Button>
            ) : undefined
          }
        >
          <Loaded state={memory} label="memory">
            {(items) =>
              items.length === 0 ? (
                <p className="text-caption text-fg-muted" data-testid="memory-empty">
                  Nothing saved. When you tell Mini AI something like “my supplier confirmed stock for Friday”, it notes it here so you don’t have to repeat it.
                </p>
              ) : (
                <ul className="divide-y divide-line" data-testid="memory-list">
                  {items.map((item) => (
                    <MemoryItem key={item.id} item={item} />
                  ))}
                </ul>
              )
            }
          </Loaded>
        </Card>
      </div>
      <Card title="Data and privacy" description="How this demo handles data">
        <ul className="list-disc space-y-1 pl-5 text-caption text-fg-secondary marker:text-fg-subtle">
          <li>All store data here is a demonstration dataset: the assignment’s headline figures plus synthetic records. It is not Snapdeal data.</li>
          <li>Customers appear only as anonymised IDs. Mini AI never accuses or blocks a customer.</li>
          <li>Your tracker and what Mini AI remembers are saved on this demo server. Conversations themselves are kept in memory for 30 minutes and then forgotten.</li>
          <li>Questions are sent to the language model with the data checks needed to answer them. The API key stays on the server.</li>
        </ul>
      </Card>
    </div>
  )
}
