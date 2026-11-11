import type { OverviewData } from '@shared/analytics.ts'
import { ArrowRight } from 'lucide-react'
import { SegmentedBar } from '@/components/charts/SegmentedBar'
import { CHART } from '@/components/charts/theme'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export function InventorySummary({ inventory, className }: { inventory: OverviewData['inventory']; className?: string }) {
  const segments = [
    { label: 'Healthy', value: inventory.healthy, color: CHART.positive },
    { label: 'Low stock', value: inventory.lowStock, color: CHART.warning },
    { label: 'Critical', value: inventory.critical, color: CHART.serious },
    { label: 'Restock on the way', value: inventory.replenishmentPending, color: CHART.brandSoft },
    { label: 'Out of stock', value: inventory.outOfStock - inventory.replenishmentPending, color: CHART.negative },
  ]
  return (
    <Card
      className={className}
      title="Inventory health"
      description={`${inventory.activeSkus} SKUs (sizes and colours)`}
      footer={
        <ButtonLink to="/inventory" variant="ghost" size="sm" trailingIcon={ArrowRight} className="-ml-2">
          Open inventory
        </ButtonLink>
      }
    >
      <SegmentedBar segments={segments} label="Stock status" />
    </Card>
  )
}
