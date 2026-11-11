import type { ProductPerformanceRow } from '@shared/analytics.ts'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { StatusBadge } from '@/components/data/status'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { cn } from '@/lib/cn'
import { formatCount, formatCurrency, formatPercentChange } from '@/lib/format'

const VIEWS = [
  { id: 'top', label: 'Top performers' },
  { id: 'declining', label: 'Declining' },
] as const

export function ProductTable({ top, declining, className }: { top: ProductPerformanceRow[]; declining: ProductPerformanceRow[]; className?: string }) {
  const [view, setView] = useState<(typeof VIEWS)[number]['id']>('top')
  const rows = view === 'top' ? top : declining

  return (
    <Card
      className={className}
      title="Product performance"
      description={view === 'top' ? 'Highest revenue this month' : 'Biggest revenue drops on last month'}
      actions={
        <ButtonLink to="/products" variant="ghost" size="sm" trailingIcon={ArrowRight}>
          All products
        </ButtonLink>
      }
    >
      <div className="mb-4">
        <SegmentedControl label="Product list" options={VIEWS} value={view} onChange={setView} />
      </div>
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">Product performance: {VIEWS.find((v) => v.id === view)!.label}</caption>
          <thead>
            <tr className="border-y border-line bg-surface-muted text-2xs font-semibold uppercase tracking-[0.06em] text-fg-muted">
              <th scope="col" className="px-5 py-2.5">Product</th>
              <th scope="col" className="px-5 py-2.5 text-right">Orders</th>
              <th scope="col" className="px-5 py-2.5 text-right">Revenue</th>
              <th scope="col" className="px-5 py-2.5 text-right">Change</th>
              <th scope="col" className="px-5 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productId} className="border-b border-line last:border-b-0">
                <td className="max-w-64 px-5 py-3">
                  <p className="truncate font-medium text-fg">{r.productName}</p>
                  <p className="text-2xs text-fg-muted">{r.sku}</p>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">{formatCount(r.orders)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(r.revenue)}</td>
                <td className={cn('px-5 py-3 text-right tabular-nums', r.revenueChange < 0 ? 'text-negative' : 'text-positive')}>
                  {r.revenuePercentChange === null ? '—' : formatPercentChange(r.revenuePercentChange)}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={r.performanceStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
