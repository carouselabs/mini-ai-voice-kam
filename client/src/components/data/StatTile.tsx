import { CircleDashed, MessageCircleQuestion } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAssistant } from '@/app/providers/assistant-context'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

/** One figure with an optional comparison line. Colour always comes with words. */
export function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: 'positive' | 'negative' | 'warning' }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface px-4 py-3 shadow-card" data-stat={label}>
      <p className="truncate text-caption text-fg-muted">{label}</p>
      <p className="mt-1 text-metric font-semibold tabular-nums text-fg">{value}</p>
      {sub && (
        <p className={cn('text-2xs text-fg-muted', tone === 'negative' && 'text-negative', tone === 'positive' && 'text-positive', tone === 'warning' && 'text-warning')}>
          {sub}
        </p>
      )}
    </div>
  )
}

/** Says plainly that this demo has no data for something, instead of inventing it. */
export function Unavailable({ title, reason, items, question }: { title: string; reason: string; items: string[]; question?: string }) {
  const { openAssistant } = useAssistant()
  return (
    <Card title={title} description={reason} data-testid="unavailable">
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 rounded-control border border-dashed border-line-strong bg-surface-muted px-3 py-2 text-caption text-fg-muted">
            <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" strokeWidth={1.9} />
            <span>
              {item}
              <span className="block text-2xs">Not in this demo dataset</span>
            </span>
          </li>
        ))}
      </ul>
      {question && (
        <button
          type="button"
          onClick={() => openAssistant(question)}
          className="mt-3 inline-flex items-center gap-2 text-caption font-medium text-accent-fg hover:underline"
        >
          <MessageCircleQuestion aria-hidden className="size-4" /> “{question}”
        </button>
      )}
    </Card>
  )
}
