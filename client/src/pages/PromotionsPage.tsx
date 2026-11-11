import type { ProductAnalysis, ProductPerformanceRow } from '@shared/analytics.ts'
import { MessageCircleQuestion } from 'lucide-react'
import { useAssistant } from '@/app/providers/assistant-context'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { StatusBadge } from '@/components/data/status'
import { Unavailable } from '@/components/data/StatTile'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/StateViews'
import { useApi } from '@/hooks/useApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatCount, formatCurrency, formatPercent } from '@/lib/format'

/** Flags that make promotion a bad idea until fixed: more traffic would hit the same problem. */
const BLOCKERS = ['High returns', 'Low rating', 'High cancellations', 'Thin margin', 'Some sizes or colours out of stock']

function reasonsFor(row: ProductPerformanceRow): string[] {
  const reasons: string[] = []
  if (row.flags.includes('Low visibility, high conversion')) reasons.push('Converts well but is rarely shown')
  if (row.revenueChange > 0) reasons.push(`Sales grew ${formatCurrency(row.previousRevenue)} → ${formatCurrency(row.revenue)}`)
  return reasons
}

function Row({ row, chips, tone }: { row: ProductPerformanceRow; chips: string[]; tone: 'positive' | 'warning' }) {
  return (
    <li data-product={row.productId} className="py-3 text-caption">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-fg">{row.productName}</span>
        <StatusBadge status={row.performanceStatus} />
      </div>
      <p className="mt-1 text-fg-muted">
        Conversion {formatPercent(row.conversionRate)} · {formatCount(row.impressions)} impressions · {row.availableStock} in stock · margin {formatPercent(row.grossMargin)} · rating{' '}
        {row.rating}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <Badge key={c} tone={tone}>
            {c}
          </Badge>
        ))}
      </div>
    </li>
  )
}

export function PromotionsPage() {
  useDocumentTitle('Promotions')
  const { openAssistant } = useAssistant()
  const products = useApi<ProductAnalysis>('/api/analytics/products')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promotions"
        description="Which products are worth promoting, and which to fix first. There is no campaign data in this demo, so these are candidates, not results."
        actions={
          <Button icon={MessageCircleQuestion} onClick={() => openAssistant('Which products should I promote?')}>
            Ask about promotions
          </Button>
        }
      />
      <Loaded state={products} label="products">
        {(p, meta) => {
          const inStock = (r: ProductPerformanceRow) => r.availableStock > 0 && r.listingStatus !== 'Out of Stock'
          const candidates = p.rows.filter((r) => inStock(r) && reasonsFor(r).length > 0 && !r.flags.some((f) => BLOCKERS.includes(f)))
          const hold = p.rows
            .filter((r) => (reasonsFor(r).length > 0 || r.productViews >= 800) && (!inStock(r) || r.flags.some((f) => BLOCKERS.includes(f))))
            .map((r) => ({ row: r, blockers: [...(!inStock(r) ? ['Out of stock'] : []), ...r.flags.filter((f) => BLOCKERS.includes(f))] }))
          return (
            <>
              <SourceNote meta={meta}>
                Derived by Mini AI from conversion, impressions, sales trend, stock, returns, rating and margin. Whether a promotion would lift sales is a hypothesis
                the data cannot confirm.
              </SourceNote>
              <div className="grid gap-4 xl:grid-cols-2">
                <Card title="Candidates to promote" description="In stock, no quality or margin warning, and either growing or converting well with little visibility">
                  {candidates.length === 0 ? (
                    <EmptyState title="No clear candidates" message="Every product with an upside also has a warning to fix first." />
                  ) : (
                    <ul className="divide-y divide-line" data-testid="promotion-candidates">
                      {candidates.map((r) => (
                        <Row key={r.productId} row={r} chips={reasonsFor(r)} tone="positive" />
                      ))}
                    </ul>
                  )}
                </Card>
                <Card title="Fix before promoting" description="More traffic would hit the same problem: stockouts, returns, low ratings or thin margins">
                  {hold.length === 0 ? (
                    <EmptyState title="Nothing to hold back" message="No product with traffic has a blocking warning." />
                  ) : (
                    <ul className="divide-y divide-line" data-testid="promotion-hold">
                      {hold.map(({ row, blockers }) => (
                        <Row key={row.productId} row={row} chips={blockers} tone="warning" />
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </>
          )
        }}
      </Loaded>
      <Unavailable
        title="Not available in this demo"
        reason="The demo dataset has no promotion, coupon or campaign records."
        items={['Active and upcoming promotions', 'Sales lift from past promotions', 'Deal and festival calendar', 'Ad spend and return on ads']}
      />
    </div>
  )
}
