import type { KpiMetric } from '@shared/analytics.ts'
import type { LucideIcon } from 'lucide-react'
import { useId } from 'react'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { describeKpiChange, formatKpiChange, formatKpiValue } from '@/lib/format'
import { ChangeBadge } from './ChangeBadge'

const SOURCE_LABEL = {
  assignment_provided: 'Assignment',
  synthetic_demo: 'Synthetic',
  derived: 'Derived',
  seller_provided: 'From you',
} as const

export function MetricCard({ metric, icon: Icon, previousLabel }: { metric: KpiMetric; icon: LucideIcon; previousLabel: string }) {
  const labelId = useId()
  const fromAssignment = metric.source === 'assignment_provided'

  return (
    <article aria-labelledby={labelId} data-metric={metric.key} className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-control bg-ink-100 text-ink-700">
          <Icon aria-hidden className="size-4" strokeWidth={1.8} />
        </span>
        <h3 id={labelId} className="min-w-0 flex-1 truncate text-caption font-medium text-fg-secondary">
          {metric.label}
        </h3>
        <Tooltip content={metric.note} side="top">
          <span
            data-testid="metric-source"
            className={cn(
              'rounded-full px-1.5 py-px text-[0.625rem] font-semibold uppercase tracking-[0.06em]',
              fromAssignment ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-fg-muted',
            )}
          >
            {SOURCE_LABEL[metric.source]}
            <span className="sr-only">: {metric.note}</span>
          </span>
        </Tooltip>
      </div>

      <p data-testid="metric-value" className="mt-4 text-metric font-semibold text-fg">
        {formatKpiValue(metric, metric.current)}
      </p>

      <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-x-1.5 gap-y-1">
        <ChangeBadge
          text={formatKpiChange(metric)}
          direction={metric.direction}
          tone={metric.tone}
          description={describeKpiChange(metric, previousLabel)}
        />
        <span className="text-2xs text-fg-muted">vs {previousLabel}</span>
      </div>

      <p className="mt-4 border-t border-line pt-3 text-2xs text-fg-muted">
        {previousLabel} <span className="font-medium tabular-nums text-fg-secondary">{formatKpiValue(metric, metric.previous)}</span>
      </p>
    </article>
  )
}
