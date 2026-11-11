import type { Share } from '@shared/analytics.ts'
import { SegmentedBar } from '@/components/charts/SegmentedBar'
import { CHART } from '@/components/charts/theme'
import { Card } from '@/components/ui/Card'

const GROUPS = [
  { label: 'Delivered', statuses: ['Delivered'], color: CHART.current },
  { label: 'In progress', statuses: ['New', 'Confirmed', 'Processing', 'Ready to Ship', 'Shipped'], color: CHART.brandSoft },
  { label: 'Returned', statuses: ['Return Requested', 'Returned'], color: CHART.warning },
  { label: 'Cancelled', statuses: ['Cancelled'], color: CHART.negative },
]

export function OrderStatusDistribution({ distribution, periodLabel, className }: { distribution: Share[]; periodLabel: string; className?: string }) {
  const segments = GROUPS.map((g) => ({
    label: g.label,
    color: g.color,
    value: distribution.filter((d) => g.statuses.includes(d.key)).reduce((s, d) => s + d.count, 0),
  }))
  return (
    <Card className={className} title="Order status" description={`Where ${periodLabel}’s orders stand now`}>
      <SegmentedBar segments={segments} label="Order status" />
    </Card>
  )
}
