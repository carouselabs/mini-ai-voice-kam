import type { Order, PeriodKey } from '@shared/records.ts'
import { useState } from 'react'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { StatusBadge } from '@/components/data/status'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useApi } from '@/hooks/useApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useSeller } from '@/hooks/useSeller'
import { formatCurrency, formatDate } from '@/lib/format'

type OrderRow = Order & { productName: string }

const ORDER_STATUSES = ['New', 'Confirmed', 'Processing', 'Ready to Ship', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Returned']
const FULFILMENT = ['Not Started', 'Packed', 'In Transit', 'Delivered', 'Cancelled', 'Return in Transit', 'Returned to Seller']

const COLUMNS: Column<OrderRow>[] = [
  { id: 'id', header: 'Order', sortValue: (r) => r.orderId, cell: (r) => <span className="whitespace-nowrap font-medium text-fg">{r.orderId}</span> },
  { id: 'date', header: 'Date', sortValue: (r) => r.orderDate, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.orderDate)}</span> },
  {
    id: 'product',
    header: 'Product',
    sortValue: (r) => r.productName,
    cell: (r) => (
      <div className="max-w-60">
        <p className="truncate text-fg">{r.productName}</p>
        <p className="text-2xs text-fg-muted">{r.sku}</p>
      </div>
    ),
  },
  { id: 'qty', header: 'Qty', align: 'end', sortValue: (r) => r.quantity, cell: (r) => r.quantity },
  { id: 'amount', header: 'Amount', align: 'end', sortValue: (r) => r.totalAmount, cell: (r) => formatCurrency(r.totalAmount) },
  { id: 'customer', header: 'Customer', sortValue: (r) => r.anonymisedCustomerId, cell: (r) => <span className="whitespace-nowrap text-2xs">{r.anonymisedCustomerId}</span> },
  { id: 'status', header: 'Order status', sortValue: (r) => r.orderStatus, cell: (r) => <StatusBadge status={r.orderStatus} /> },
  { id: 'fulfilment', header: 'Fulfilment', sortValue: (r) => r.fulfilmentStatus, cell: (r) => <span className="whitespace-nowrap">{r.fulfilmentStatus}</span> },
  { id: 'payment', header: 'Payment', sortValue: (r) => r.paymentStatus, cell: (r) => <span className="whitespace-nowrap text-2xs">{r.paymentMethod} · {r.paymentStatus}</span> },
]

export function OrdersPage() {
  useDocumentTitle('Orders')
  const { periods } = useSeller()
  const [period, setPeriod] = useState<PeriodKey>('current')
  const orders = useApi<OrderRow[]>(`/api/orders?period=${period}`)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Every order and where it stands, from placed to delivered."
        actions={
          <SegmentedControl
            label="Period"
            value={period}
            onChange={setPeriod}
            options={[
              { id: 'current', label: periods?.current.shortLabel ?? 'This month' },
              { id: 'previous', label: periods?.previous.shortLabel ?? 'Last month' },
            ]}
          />
        }
      />
      <Loaded state={orders} label="orders">
        {(rows, meta) => (
          <>
            <SourceNote meta={meta}>Customer IDs are anonymised.</SourceNote>
            <Card title={`${meta.periods[period].label} orders`} description={`${rows.length} orders`}>
              <DataTable
                caption="Orders"
                rows={rows}
                columns={COLUMNS}
                rowKey={(r) => r.orderId}
                search={{ placeholder: 'Search order, product or customer', text: (r) => `${r.orderId} ${r.productName} ${r.sku} ${r.anonymisedCustomerId}` }}
                filters={[
                  { id: 'status', label: 'Order statuses', options: ORDER_STATUSES, value: (r) => r.orderStatus },
                  { id: 'fulfilment', label: 'Fulfilment statuses', options: FULFILMENT, value: (r) => r.fulfilmentStatus },
                ]}
                initialSort={{ id: 'date', direction: 'desc' }}
                pageSize={20}
                minWidth="72rem"
              />
            </Card>
          </>
        )}
      </Loaded>
    </div>
  )
}
