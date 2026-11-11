import type { Breakdown, RateComparison } from '@shared/analytics.ts'
import { ArrowRight } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatPercent, formatPointChange } from '@/lib/format'
import { ChangeBadge } from './ChangeBadge'

interface Props {
  cancellations: { rate: RateComparison; topReasons: Breakdown[] }
  returns: { rate: RateComparison; topReasons: Breakdown[] }
  previousLabel: string
  className?: string
}

function RateTile({ label, rate, previousLabel }: { label: string; rate: RateComparison; previousLabel: string }) {
  return (
    <div className="min-w-0 rounded-control border border-line bg-surface-muted p-3">
      <dt className="truncate text-2xs font-medium text-fg-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tracking-[-0.015em] text-fg">{formatPercent(rate.current)}</dd>
      <dd className="mt-1.5">
        <ChangeBadge
          text={formatPointChange(rate.pointChange)}
          direction={rate.direction}
          tone={rate.direction === 'flat' ? 'neutral' : rate.direction === 'up' ? 'negative' : 'positive'}
          description={`${label} ${rate.direction === 'up' ? 'up' : 'down'} ${formatPointChange(Math.abs(rate.pointChange))} on ${previousLabel}.`}
        />
      </dd>
      <dd className="mt-1.5 truncate text-2xs text-fg-muted">
        {previousLabel} {formatPercent(rate.previous)}
      </dd>
    </div>
  )
}

function Reasons({ title, reasons }: { title: string; reasons: Breakdown[] }) {
  const max = Math.max(1, ...reasons.map((r) => r.current))
  return (
    <div>
      <h3 className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{title}</h3>
      <ul className="mt-2 space-y-2">
        {reasons.map((r) => (
          <li key={r.key} className="text-caption">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-fg-secondary">{r.key}</span>
              <span className="shrink-0 tabular-nums text-fg">
                <span className="font-semibold">{r.current}</span>
                <span className="ml-1.5 text-2xs text-fg-muted">was {r.previous}</span>
              </span>
            </div>
            <span aria-hidden className="mt-1 block h-1.5 rounded-full bg-ink-100">
              <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(r.current / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CancellationReturnOverview({ cancellations, returns, previousLabel, className }: Props) {
  return (
    <Card
      className={className}
      title="Cancellations & returns"
      description="Orders lost, and why"
      footer={
        <ButtonLink to="/cancellations" variant="ghost" size="sm" trailingIcon={ArrowRight} className="-ml-2">
          Cancellation details
        </ButtonLink>
      }
    >
      <dl className="grid grid-cols-2 gap-3">
        <RateTile label="Cancellation rate" rate={cancellations.rate} previousLabel={previousLabel} />
        <RateTile label="Return rate" rate={returns.rate} previousLabel={previousLabel} />
      </dl>
      <div className="mt-5 grid gap-5">
        <Reasons title="Top cancellation reasons" reasons={cancellations.topReasons.slice(0, 3)} />
        <Reasons title="Top return reasons" reasons={returns.topReasons.slice(0, 3)} />
      </div>
    </Card>
  )
}
