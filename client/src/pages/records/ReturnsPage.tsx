import type { ReturnAnalysis } from '@shared/analytics.ts'
import type { PeriodKey, ReturnRecord } from '@shared/records.ts'
import { useState } from 'react'
import { ComparisonBars } from '@/components/charts/ComparisonBars'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { StatusBadge } from '@/components/data/status'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useApi } from '@/hooks/useApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useSeller } from '@/hooks/useSeller'
import { formatCurrency, formatDate, formatPercent, formatPointChange } from '@/lib/format'

type Row = ReturnRecord & { productName: string }

const COLUMNS: Column<Row>[] = [
  { id: 'id', header: 'Return', sortValue: (r) => r.returnId, cell: (r) => <span className="font-medium text-fg">{r.returnId}</span> },
  { id: 'product', header: 'Product', sortValue: (r) => r.productName, cell: (r) => <p className="max-w-56 truncate text-fg">{r.productName}</p> },
  { id: 'order', header: 'Order', sortValue: (r) => r.orderId, cell: (r) => <span className="whitespace-nowrap">{r.orderId}</span> },
  {
    id: 'reason',
    header: 'Reason',
    sortValue: (r) => r.returnReason,
    cell: (r) => (
      <span>
        {r.returnReason}
        {r.qualityComplaint && <span className="ml-1.5 text-2xs font-semibold text-negative">Quality</span>}
      </span>
    ),
  },
  { id: 'condition', header: 'Condition', sortValue: (r) => r.returnCondition, cell: (r) => r.returnCondition },
  { id: 'inspection', header: 'Inspection', sortValue: (r) => r.inspectionStatus, cell: (r) => <StatusBadge status={r.inspectionStatus} /> },
  { id: 'refund', header: 'Refund', sortValue: (r) => r.refundStatus, cell: (r) => <StatusBadge status={r.refundStatus} /> },
  { id: 'amount', header: 'Amount', align: 'end', sortValue: (r) => r.refundAmount, cell: (r) => formatCurrency(r.refundAmount) },
  { id: 'date', header: 'Date', sortValue: (r) => r.returnDate, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.returnDate)}</span> },
]

const unique = (rows: Row[], pick: (r: Row) => string) => [...new Set(rows.map(pick))].sort()

export function ReturnsPage() {
  useDocumentTitle('Returns & Refunds')
  const { periods } = useSeller()
  const [period, setPeriod] = useState<PeriodKey>('current')
  const records = useApi<Row[]>(`/api/returns?period=${period}`)
  const analysis = useApi<ReturnAnalysis>('/api/analytics/returns')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Returns & Refunds"
        description="Returned orders, their condition, refund status and the reasons behind them."
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
      <Loaded state={analysis} label="return analysis">
        {(a, meta) => (
          <>
            <SourceNote meta={meta}>{a.notes.join(' ')}</SourceNote>
            <div className="grid gap-4 xl:grid-cols-3">
              <Card
                className="xl:col-span-2"
                title="Return reasons"
                description={`Rate ${formatPercent(a.records.rate.previous)} → ${formatPercent(a.records.rate.current)} (${formatPointChange(a.records.rate.pointChange)})`}
              >
                <ComparisonBars data={a.reasons} periods={meta.periods} noun="Returns" />
              </Card>
              <Card title="Most-returned products" description="This month, returns ÷ deliveries">
                <ul className="divide-y divide-line">
                  {a.byProduct.slice(0, 6).map((p) => (
                    <li key={p.productId} className="py-2.5 text-caption">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-fg-secondary">{p.productName}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-fg">{formatPercent(p.rate)}</span>
                      </div>
                      <p className="text-2xs text-fg-muted">
                        {p.returns} of {p.delivered} · {p.topReason}
                        {p.qualityComplaints ? ` · ${p.qualityComplaints} quality complaints` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </>
        )}
      </Loaded>
      <Loaded state={records} label="returns">
        {(rows, meta) => (
          <Card title={`${meta.periods[period].label} returns`} description={`${rows.length} returns`}>
            <DataTable
              caption="Returns"
              rows={rows}
              columns={COLUMNS}
              rowKey={(r) => r.returnId}
              search={{ placeholder: 'Search product, order or reason', text: (r) => `${r.returnId} ${r.orderId} ${r.productName} ${r.returnReason}` }}
              filters={[
                { id: 'reason', label: 'Reasons', options: unique(rows, (r) => r.returnReason), value: (r) => r.returnReason },
                { id: 'condition', label: 'Conditions', options: unique(rows, (r) => r.returnCondition), value: (r) => r.returnCondition },
                { id: 'refund', label: 'Refund statuses', options: unique(rows, (r) => r.refundStatus), value: (r) => r.refundStatus },
              ]}
              initialSort={{ id: 'date', direction: 'desc' }}
              minWidth="66rem"
            />
          </Card>
        )}
      </Loaded>
    </div>
  )
}
