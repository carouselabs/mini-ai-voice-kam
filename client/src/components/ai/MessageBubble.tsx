import { ArrowRight, CircleAlert, Info, Mic } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { ConversationMessage } from '@/app/providers/assistant-context'
import { cn } from '@/lib/cn'
import { EvidenceCard } from './EvidenceCard'
import { ReplyActions } from './ReplyActions'

const ENTER = 'transition-[opacity,transform] duration-200 ease-out-quint starting:translate-y-1 starting:opacity-0'

export function MessageBubble({ message, onNavigate }: { message: ConversationMessage; onNavigate: () => void }) {
  const [showEvidence, setShowEvidence] = useState(false)

  if (message.author === 'system') {
    const Icon = message.tone === 'error' ? CircleAlert : Info
    return (
      <p className={cn('mx-auto flex max-w-[92%] items-start gap-1.5 text-2xs', message.tone === 'error' ? 'text-negative' : 'text-fg-muted', ENTER)}>
        <Icon aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={1.9} />
        <span>{message.text}</span>
      </p>
    )
  }

  if (message.author === 'seller') {
    return (
      <div className="flex justify-end">
        <p className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-white', ENTER)}>
          <span className="sr-only">You{message.via === 'voice' ? ' (spoken)' : ''}: </span>
          {message.via === 'voice' && <Mic aria-hidden className="-mt-0.5 mr-1.5 inline size-3.5 opacity-80" />}
          {message.text}
        </p>
      </div>
    )
  }

  const reply = message.reply
  return (
    <div data-testid="assistant-message" className={cn('max-w-[92%]', ENTER)}>
      <p className="whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-ink-100 px-3.5 py-2 text-sm text-fg">
        <span className="sr-only">Mini AI: </span>
        {message.text}
      </p>
      {reply && reply.checks.length > 0 && (
        <p className="mt-1 px-1 text-2xs text-fg-muted">Checked: {reply.checks.join(' · ')}</p>
      )}
      {reply && (reply.evidence.length > 0 || reply.links.length > 0) && (
        <div className="mt-1.5 space-y-2 px-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {reply.evidence.length > 0 && (
              <button
                type="button"
                aria-expanded={showEvidence}
                onClick={() => setShowEvidence((v) => !v)}
                className="text-2xs font-semibold text-brand-700 hover:underline"
              >
                {showEvidence ? 'Hide findings' : `Show findings (${reply.evidence.length})`}
              </button>
            )}
            {reply.links.map((link) => (
              <Link key={link.path} to={link.path} onClick={onNavigate} className="inline-flex items-center gap-1 text-2xs font-medium text-brand-700 hover:underline">
                Open {link.label}
                <ArrowRight aria-hidden className="size-3" />
              </Link>
            ))}
          </div>
          {showEvidence && (
            <section aria-label="What the data shows" className="space-y-2">
              <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">What the data shows</p>
              {reply.evidence.map((card) => (
                <EvidenceCard key={card.findingId} card={card} onNavigate={onNavigate} />
              ))}
            </section>
          )}
        </div>
      )}
      {reply && ((reply.actions ?? []).length > 0 || (reply.tracker ?? []).length > 0) && (
        <section aria-label="Recommended actions" className="mt-2 px-1">
          <ReplyActions actions={reply.actions ?? []} tracker={reply.tracker ?? []} onNavigate={onNavigate} />
        </section>
      )}
    </div>
  )
}
