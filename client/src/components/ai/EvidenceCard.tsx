import type { EvidenceCard as Card } from '@shared/ai.ts'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/format'

const SOURCE = { assignment_provided: 'Assignment data', synthetic_demo: 'Synthetic demo data', derived: 'Derived', seller_provided: 'From you', mixed: 'Assignment + synthetic data' } as const
const SOURCE_SHORT = { assignment_provided: 'Assignment', synthetic_demo: 'Synthetic', derived: 'Derived', seller_provided: 'You' } as const
const CONFIDENCE = { high: 'positive', medium: 'warning', low: 'neutral' } as const

/** A finding the assistant relied on, exactly as the investigation engine produced it. */
export function EvidenceCard({ card, onNavigate }: { card: Card; onNavigate: () => void }) {
  return (
    <article data-testid="evidence-card" data-finding={card.findingId} className="rounded-control border border-line bg-surface p-3 text-caption">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-fg">{card.title}</p>
        <Badge tone={CONFIDENCE[card.confidence]}>{card.confidence} confidence</Badge>
      </div>
      <p className="mt-1 text-fg-secondary">{card.observation}</p>
      {card.impact && <p className="mt-1 text-2xs text-fg-muted">Impact: {card.impact}</p>}
      {card.evidence.length > 0 && (
        <dl className="mt-2 space-y-0.5" aria-label={`Figures, ${card.period}`}>
          {card.evidence.map((e) => (
            <div key={e.label} className="flex items-baseline justify-between gap-3 text-2xs">
              <dt className="min-w-0 truncate text-fg-muted">{e.label}</dt>
              <dd className="shrink-0 text-right">
                <span className="font-medium tabular-nums text-fg">{e.value}</span>
                {e.source && <span className="ml-1.5 text-fg-muted">{SOURCE_SHORT[e.source]}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {card.products.length > 0 && <p className="mt-2 text-2xs text-fg-muted">Products: {card.products.join(', ')}</p>}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2 text-2xs text-fg-muted">
        <span>
          {card.period ? `${card.period} · ` : ''}
          {SOURCE[card.dataSource]} · as of {formatDate(card.lastUpdatedAt)}
        </span>
        {card.link && (
          <Link to={card.link.path} onClick={onNavigate} className="inline-flex shrink-0 items-center gap-1 font-medium text-brand-700 hover:underline">
            {card.link.label}
            <ArrowRight aria-hidden className="size-3" />
          </Link>
        )}
      </div>
    </article>
  )
}
