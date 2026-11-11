import type { DailyPoint, KpiMetric } from '@shared/analytics.ts'
import type { Period } from '@shared/records.ts'
import { DailyTrendChart } from '@/components/charts/DailyTrendChart'
import { Card } from '@/components/ui/Card'
import { formatKpiValue } from '@/lib/format'

interface TrendCardProps {
  data: DailyPoint[]
  periods: { previous: Period; current: Period }
  headline: KpiMetric
  className?: string
}

function Headline({ metric, label }: { metric: KpiMetric; label: string }) {
  return (
    <div className="text-right">
      <p className="text-sm font-semibold text-fg">{formatKpiValue(metric, metric.current)}</p>
      <p className="text-2xs text-fg-muted">{label}</p>
    </div>
  )
}

export function RevenueChart({ data, periods, headline, className }: TrendCardProps) {
  return (
    <Card
      className={className}
      title="Revenue performance"
      description={`Daily sales, ${periods.current.label} against ${periods.previous.label}`}
      actions={<Headline metric={headline} label={periods.current.shortLabel} />}
    >
      <DailyTrendChart data={data} periods={periods} metric="revenue" height={300} />
    </Card>
  )
}

export function OrdersChart({ data, periods, headline, className }: TrendCardProps) {
  return (
    <Card
      className={className}
      title="Order performance"
      description="Orders per day"
      actions={<Headline metric={headline} label={periods.current.shortLabel} />}
    >
      <DailyTrendChart data={data} periods={periods} metric="orders" height={260} />
    </Card>
  )
}
