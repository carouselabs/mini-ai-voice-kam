import type { ProductPerformanceRow } from '@shared/analytics.ts'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { StatusBadge } from '@/components/data/status'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { useApi } from '@/hooks/useApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { formatCount, formatCurrency, formatPercent, formatPercentChange } from '@/lib/format'

const COLUMNS: Column<ProductPerformanceRow>[] = [
  {
    id: 'product',
    header: 'Product',
    sortValue: (r) => r.productName,
    cell: (r) => (
      <div className="max-w-64">
        <p className="truncate font-medium text-fg">{r.productName}</p>
        <p className="text-2xs text-fg-muted">
          {r.sku} · {r.category}
        </p>
      </div>
    ),
  },
  { id: 'price', header: 'Price', align: 'end', sortValue: (r) => r.sellingPrice, cell: (r) => formatCurrency(r.sellingPrice) },
  { id: 'stock', header: 'Stock', align: 'end', sortValue: (r) => r.availableStock, cell: (r) => formatCount(r.availableStock) },
  {
    id: 'orders',
    header: 'Orders',
    align: 'end',
    sortValue: (r) => r.orders,
    cell: (r) => (
      <>
        {formatCount(r.orders)}
        <span className="ml-1 text-2xs text-fg-muted">/ {r.previousOrders}</span>
      </>
    ),
  },
  { id: 'revenue', header: 'Revenue', align: 'end', sortValue: (r) => r.revenue, cell: (r) => formatCurrency(r.revenue) },
  {
    id: 'change',
    header: 'Change',
    align: 'end',
    sortValue: (r) => r.revenuePercentChange,
    cell: (r) => (
      <span className={cn(r.revenueChange < 0 ? 'text-negative' : r.revenueChange > 0 ? 'text-positive' : '')}>
        {r.revenuePercentChange === null ? '—' : formatPercentChange(r.revenuePercentChange)}
      </span>
    ),
  },
  { id: 'conversion', header: 'Conversion', align: 'end', sortValue: (r) => r.conversionRate, cell: (r) => formatPercent(r.conversionRate) },
  { id: 'cancel', header: 'Cancelled', align: 'end', sortValue: (r) => r.cancellationRate, cell: (r) => formatPercent(r.cancellationRate) },
  { id: 'return', header: 'Returned', align: 'end', sortValue: (r) => r.returnRate, cell: (r) => formatPercent(r.returnRate) },
  { id: 'rating', header: 'Rating', align: 'end', sortValue: (r) => r.rating, cell: (r) => `${r.rating.toFixed(1)}★` },
  { id: 'status', header: 'Status', sortValue: (r) => r.performanceStatus, cell: (r) => <StatusBadge status={r.performanceStatus} /> },
]

export function ProductsPage() {
  useDocumentTitle('Products')
  const products = useApi<ProductPerformanceRow[]>('/api/products?limit=1000')
  return (
    <div className="space-y-6">
      <PageHeader title="Products" description="Sales, conversion, cancellations, returns and stock for every product, this month against last." />
      <Loaded state={products} label="products">
        {(rows, meta) => (
          <>
            <SourceNote meta={meta}>Orders show this month / last month.</SourceNote>
            <Card title="All products" description={`${rows.length} products, ${meta.periods.current.label}`}>
              <DataTable
                caption="Products"
                rows={rows}
                columns={COLUMNS}
                rowKey={(r) => r.productId}
                search={{ placeholder: 'Search products or SKUs', text: (r) => `${r.productName} ${r.sku} ${r.productId}` }}
                filters={[
                  { id: 'category', label: 'Categories', options: ['Fashion', 'Lifestyle', 'Electronics'], value: (r) => r.category },
                  {
                    id: 'status',
                    label: 'Statuses',
                    options: ['Top performer', 'Healthy', 'At risk', 'Needs attention', 'Declining', 'Out of stock'],
                    value: (r) => r.performanceStatus,
                  },
                ]}
                initialSort={{ id: 'revenue', direction: 'desc' }}
                pageSize={20}
                minWidth="64rem"
              />
            </Card>
          </>
        )}
      </Loaded>
    </div>
  )
}
