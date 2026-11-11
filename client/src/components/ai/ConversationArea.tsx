import { Check, Loader2, RotateCcw, Settings2, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useAssistant } from '@/app/providers/assistant-context'
import { BrandOrb } from '@/components/brand/OrbitGlyph'
import { Button } from '@/components/ui/Button'
import { SUGGESTED_QUESTIONS } from '@/data/assistant'
import { useReducedMotion } from '@/hooks/useMediaQuery'
import { useSeller } from '@/hooks/useSeller'
import { MessageBubble } from './MessageBubble'

export function ConversationArea({ onSuggestion, onNavigate }: { onSuggestion: (question: string) => void; onNavigate: () => void }) {
  const { messages, connection, connectionMessage, retryConnection, busy, checks, voice } = useAssistant()
  const { name } = useSeller()
  const scrollRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const sellerSpoke = messages.some((m) => m.author === 'seller')

  useEffect(() => {
    const container = scrollRef.current
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [messages.length, checks.length, voice.interim, reducedMotion])

  return (
    <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mb-4 flex items-center gap-3">
        <BrandOrb size="lg" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">Your Virtual Key Account Manager</p>
          <p className="truncate text-2xs text-fg-muted">Working from {name}’s demo data</p>
        </div>
      </div>

      {connection === 'not_configured' && (
        <div role="status" className="mb-4 rounded-control border border-dashed border-warning-mark bg-warning-soft p-3 text-caption text-warning">
          <p className="flex items-center gap-1.5 font-semibold">
            <Settings2 aria-hidden className="size-4" /> The AI model isn’t configured
          </p>
          <p className="mt-1 text-fg-secondary">{connectionMessage}</p>
          <p className="mt-1 text-fg-secondary">The dashboard keeps working. Mini AI won’t make up answers without a model.</p>
        </div>
      )}

      {connection === 'error' && (
        <div role="alert" className="mb-4 rounded-control border border-line bg-negative-soft p-3 text-caption text-negative">
          <p>{connectionMessage ?? 'Could not connect to Mini AI.'}</p>
          <Button size="sm" icon={RotateCcw} className="mt-2" onClick={retryConnection}>
            Try again
          </Button>
        </div>
      )}

      <div role="log" aria-live="polite" aria-label="Conversation">
        <ol className="space-y-3">
          {messages.map((message) => (
            <li key={message.id}>
              <MessageBubble message={message} onNavigate={onNavigate} />
            </li>
          ))}
        </ol>
      </div>

      {busy && (
        <div data-testid="assistant-activity" className="mt-3 rounded-control bg-surface-muted px-3 py-2 text-2xs text-fg-secondary">
          <p className="mb-1 font-semibold text-fg">{checks.length ? 'Looking into your data' : 'Thinking'}</p>
          <ul className="space-y-0.5">
            {checks.map((c) => (
              <li key={c.callId} className="flex items-center gap-1.5">
                {c.status === 'running' ? (
                  <Loader2 aria-hidden className="size-3 animate-spin text-brand-600 motion-reduce:animate-none" />
                ) : c.status === 'done' ? (
                  <Check aria-hidden className="size-3 text-positive" />
                ) : (
                  <X aria-hidden className="size-3 text-negative" />
                )}
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {voice.state === 'listening' && (
        <p data-testid="live-transcript" aria-live="polite" className="ml-auto mt-3 max-w-[85%] rounded-2xl rounded-br-md border border-dashed border-brand-300 px-3.5 py-2 text-sm italic text-fg-secondary">
          {voice.interim || 'Listening…'}
        </p>
      )}

      {connection === 'ready' && !sellerSpoke && !busy && (
        <div className="mt-5">
          <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Try asking</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((question) => (
              <li key={question}>
                <button
                  type="button"
                  onClick={() => onSuggestion(question)}
                  className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-left text-caption text-fg-secondary transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
                >
                  {question}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
