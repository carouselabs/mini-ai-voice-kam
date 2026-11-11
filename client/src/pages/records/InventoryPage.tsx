import type { InventoryRecord } from '@shared/records.ts'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { StatusBadge } from '@/components/data/status'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { useApi } from '@/hooks/useApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatCount, formatDate, formatDecimal } from '@/lib/format'

type InventoryRow = InventoryRecord & {
  productName: string
  supplierName: string
  runsOutBeforeReplenishment: boolean
}

const STATUS_ORDER = ['Out of Stock', 'Critical', 'Replenishment Pending', 'Low Stock', 'Healthy']

const COLUMNS: Column<InventoryRow>[] = [
  {
    id: 'product',
    header: 'Product',
    sortValue: (r) => r.productName,
    cell: (r) => (
      <div className="max-w-64">
        <p className="truncate font-medium text-fg">{r.productName}</p>
        <p className="text-2xs text-fg-muted">
          {r.variantLabel} · {r.sku}
        </p>
      </div>
    ),
  },
  { id: 'available', header: 'Available', align: 'end', sortValue: (r) => r.availableStock, cell: (r) => formatCount(r.availableStock) },
  { id: 'reserved', header: 'Reserved', align: 'end', sortValue: (r) => r.reservedStock, cell: (r) => formatCount(r.reservedStock) },
  { id: 'velocity', header: 'Sold / day', align: 'end', sortValue: (r) => r.averageDailySales, cell: (r) => formatDecimal(r.averageDailySales) },
  {
    id: 'days',
    header: 'Days left',
    align: 'end',
    sortValue: (r) => r.estimatedDaysRemaining,
    cell: (r) =>
      r.estimatedDaysRemaining === null ? (
        <span className="text-fg-muted">No recent sales</span>
      ) : (
        <span className={r.runsOutBeforeReplenishment ? 'font-semibold text-negative' : ''}>{formatDecimal(r.estimatedDaysRemaining)}</span>
      ),
  },
  { id: 'reorder', header: 'Reorder at', align: 'end', sortValue: (r) => r.reorderLevel, cell: (r) => formatCount(r.reorderLevel) },
  {
    id: 'supplier',
    header: 'Supplier',
    sortValue: (r) => r.supplierName,
    cell: (r) => (
      <div>
        <p className="truncate">{r.supplierName}</p>
        <p className="text-2xs text-fg-muted">{r.supplierLeadTimeDays}-day lead time</p>
      </div>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    sortValue: (r) => STATUS_ORDER.indexOf(r.inventoryStatus),
    cell: (r) => (
      <div className="space-y-0.5">
        <StatusBadge status={r.inventoryStatus} />
        {r.stockoutDate && <p className="text-2xs text-fg-muted">Out since {formatDate(r.stockoutDate)}</p>}
        {r.expectedRestockDate && <p className="text-2xs text-fg-muted">Restock {formatDate(r.expectedRestockDate)}</p>}
      </div>
    ),
  },
]

export function InventoryPage() {
  useDocumentTitle('Inventory')
  const inventory = useApi<InventoryRow[]>('/api/inventory?limit=1000')
  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" description="Stock for every size and colour, how long it will last and what to restock first." />
      <Loaded state={inventory} label="inventory">
        {(rows, meta) => (
          <>
            <SourceNote meta={meta}>
              Days left = available stock ÷ average daily sales on in-stock days. Red means it runs out before a reorder can arrive.
            </SourceNote>
            <Card title="Stock by SKU" description={`${rows.length} SKUs across ${new Set(rows.map((r) => r.productId)).size} products`}>
              <DataTable
                caption="Inventory"
                rows={rows}
                columns={COLUMNS}
                rowKey={(r) => r.sku}
                search={{ placeholder: 'Search products, SKUs or suppliers', text: (r) => `${r.productName} ${r.sku} ${r.supplierName}` }}
                filters={[
                  { id: 'status', label: 'Statuses', options: STATUS_ORDER, value: (r) => r.inventoryStatus },
                  { id: 'supplier', label: 'Suppliers', options: [...new Set(rows.map((r) => r.supplierName))].sort(), value: (r) => r.supplierName },
                ]}
                initialSort={{ id: 'status', direction: 'asc' }}
                pageSize={20}
                minWidth="62rem"
              />
            </Card>
          </>
        )}
      </Loaded>
    </div>
  )
}
