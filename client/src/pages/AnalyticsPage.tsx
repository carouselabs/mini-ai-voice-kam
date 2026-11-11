import type { Comparison, DeliveryAnalysis, PricingAnalysis, PricingRow, ProfitabilityAnalysis, ProfitabilityRow, RevenueAnalysis } from '@shared/analytics.ts'
import { ComparisonBars } from '@/components/charts/ComparisonBars'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { StatusBadge } from '@/components/data/status'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { useApi } from '@/hooks/useApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { formatCompactCurrency, formatCurrency, formatDecimal, formatPercent, formatPercentChange, formatPointChange } from '@/lib/format'

function Stat({ label, value, change, bad }: { label: string; value: string; change: string; bad: boolean }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <p className="text-caption font-medium text-fg-secondary">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.015em] text-fg">{value}</p>
      <p className={cn('mt-1 text-2xs font-semibold', bad ? 'text-negative' : 'text-positive')}>{change}</p>
    </div>
  )
}

const pct = (c: Comparison) => (c.percentChange === null ? '—' : formatPercentChange(c.percentChange))

const PROFIT_COLUMNS: Column<ProfitabilityRow>[] = [
  { id: 'product', header: 'Product', sortValue: (r) => r.productName, cell: (r) => <p className="max-w-60 truncate text-fg">{r.productName}</p> },
  { id: 'orders', header: 'Kept orders', align: 'end', sortValue: (r) => r.keptOrders, cell: (r) => r.keptOrders },
  { id: 'revenue', header: 'Net sales', align: 'end', sortValue: (r) => r.netRevenue, cell: (r) => formatCurrency(r.netRevenue) },
  { id: 'cost', header: 'Product cost', align: 'end', sortValue: (r) => r.estimatedCost, cell: (r) => formatCurrency(r.estimatedCost) },
  { id: 'profit', header: 'Est. gross profit', align: 'end', sortValue: (r) => r.estimatedGrossProfit, cell: (r) => formatCurrency(r.estimatedGrossProfit) },
  { id: 'margin', header: 'Margin', align: 'end', sortValue: (r) => r.grossMargin, cell: (r) => <span className={r.grossMargin < 0.2 ? 'font-semibold text-negative' : ''}>{formatPercent(r.grossMargin)}</span> },
]

const PRICING_COLUMNS: Column<PricingRow>[] = [
  { id: 'product', header: 'Product', sortValue: (r) => r.productName, cell: (r) => <p className="max-w-60 truncate text-fg">{r.productName}</p> },
  {
    id: 'price',
    header: 'Price',
    align: 'end',
    sortValue: (r) => r.currentSellingPrice,
    cell: (r) => (
      <>
        {formatCurrency(r.currentSellingPrice)}
        {r.priceChanged && <span className="block text-2xs text-fg-muted">was {formatCurrency(r.previousSellingPrice)}</span>}
      </>
    ),
  },
  { id: 'reference', header: 'Reference*', align: 'end', sortValue: (r) => r.syntheticMarketReferencePrice, cell: (r) => (r.syntheticMarketReferencePrice ? formatCurrency(r.syntheticMarketReferencePrice) : '—') },
  { id: 'position', header: 'Position', sortValue: (r) => r.priceToReference, cell: (r) => <StatusBadge status={r.pricingPosition} /> },
  { id: 'margin', header: 'Gross margin', align: 'end', sortValue: (r) => r.estimatedGrossMargin, cell: (r) => formatPercent(r.estimatedGrossMargin) },
  { id: 'conversion', header: 'Conversion', align: 'end', sortValue: (r) => r.conversionRate, cell: (r) => formatPercent(r.conversionRate) },
]

export function AnalyticsPage() {
  useDocumentTitle('Business Analytics')
  const revenue = useApi<RevenueAnalysis>('/api/analytics/revenue')
  const delivery = useApi<DeliveryAnalysis>('/api/analytics/delivery')
  const profit = useApi<ProfitabilityAnalysis>('/api/analytics/profitability')
  const pricing = useApi<PricingAnalysis>('/api/analytics/pricing')

  return (
    <div className="space-y-6">
      <PageHeader title="Business Analytics" description="Sales by category, delivery performance, estimated profit and pricing, this month against last." />

      <Loaded state={revenue} label="revenue analysis">
        {(r, meta) => (
          <>
            <SourceNote meta={meta}>{r.definition}</SourceNote>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Sales" value={formatCurrency(r.facts.sales.current)} change={`${pct(r.facts.sales)} on ${meta.periods.previous.shortLabel}`} bad={r.facts.sales.change < 0} />
              <Stat label="Net sales (kept orders)" value={formatCurrency(r.records.netSales.current)} change={`${pct(r.records.netSales)} on ${meta.periods.previous.shortLabel}`} bad={r.records.netSales.change < 0} />
              <Loaded state={delivery} label="delivery">
                {(d) => (
                  <>
                    <Stat label="On-time delivery" value={formatPercent(d.onTimeRate.current)} change={`${formatPointChange(d.onTimeRate.pointChange)} on ${meta.periods.previous.shortLabel}`} bad={d.onTimeRate.pointChange < 0} />
                    <Stat label="Average hours to dispatch" value={formatDecimal(d.averageProcessingHours.current)} change={`${pct(d.averageProcessingHours)} on ${meta.periods.previous.shortLabel}`} bad={d.averageProcessingHours.change > 0} />
                  </>
                )}
              </Loaded>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="Sales by category" description="Gross order value">
                <ComparisonBars
                  data={r.byCategory.map((c) => ({ key: c.category, previous: c.previous, current: c.current, change: c.change }))}
                  periods={meta.periods}
                  noun="Sales"
                  format={formatCompactCurrency}
                />
              </Card>
              <Loaded state={delivery} label="delivery">
                {(d) => (
                  <Card title="Delivery issues" description={d.bottleneck.note}>
                    <ComparisonBars data={d.issues} periods={meta.periods} noun="Shipments with issues" />
                  </Card>
                )}
              </Loaded>
            </div>
          </>
        )}
      </Loaded>

      <Loaded state={profit} label="profitability">
        {(p) => (
          <Card
            title="Estimated gross profit by product"
            description={`${formatCurrency(p.estimatedGrossProfit.current)} this month (${pct(p.estimatedGrossProfit)}). ${p.note}`}
          >
            <DataTable caption="Estimated gross profit by product" rows={p.rows} columns={PROFIT_COLUMNS} rowKey={(r) => r.productId} initialSort={{ id: 'profit', direction: 'desc' }} pageSize={10} minWidth="52rem" />
          </Card>
        )}
      </Loaded>

      <Loaded state={pricing} label="pricing">
        {(p) => (
          <Card title="Pricing" description={`*${p.note}`}>
            <DataTable caption="Pricing" rows={p.rows} columns={PRICING_COLUMNS} rowKey={(r) => r.productId} initialSort={{ id: 'position', direction: 'desc' }} pageSize={10} minWidth="52rem" />
          </Card>
        )}
      </Loaded>
    </div>
  )
}
