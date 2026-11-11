import type { CancellationAnalysis } from '@shared/analytics.ts'
import type { CancellationRecord, PeriodKey } from '@shared/records.ts'
import { useState } from 'react'
import { ComparisonBars } from '@/components/charts/ComparisonBars'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useApi } from '@/hooks/useApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useSeller } from '@/hooks/useSeller'
import { formatCurrency, formatDate, formatPercent, formatPointChange } from '@/lib/format'

type Row = CancellationRecord & { productName: string }

const COLUMNS: Column<Row>[] = [
  { id: 'id', header: 'Cancellation', sortValue: (r) => r.cancellationId, cell: (r) => <span className="font-medium text-fg">{r.cancellationId}</span> },
  { id: 'product', header: 'Product', sortValue: (r) => r.productName, cell: (r) => <p className="max-w-56 truncate text-fg">{r.productName}</p> },
  { id: 'order', header: 'Order', sortValue: (r) => r.orderId, cell: (r) => <span className="whitespace-nowrap">{r.orderId}</span> },
  { id: 'reason', header: 'Reason', sortValue: (r) => r.cancellationReason, cell: (r) => r.cancellationReason },
  { id: 'stage', header: 'Stage', sortValue: (r) => r.cancellationStage, cell: (r) => <span className="whitespace-nowrap">{r.cancellationStage}</span> },
  { id: 'by', header: 'Initiated by', sortValue: (r) => r.cancellationInitiatedBy, cell: (r) => r.cancellationInitiatedBy },
  { id: 'value', header: 'Order value', align: 'end', sortValue: (r) => r.orderValue, cell: (r) => formatCurrency(r.orderValue) },
  { id: 'date', header: 'Date', sortValue: (r) => r.cancellationDate, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.cancellationDate)}</span> },
]

const unique = (rows: Row[], pick: (r: Row) => string) => [...new Set(rows.map(pick))].sort()

export function CancellationsPage() {
  useDocumentTitle('Cancellations')
  const { periods } = useSeller()
  const [period, setPeriod] = useState<PeriodKey>('current')
  const records = useApi<Row[]>(`/api/cancellations?period=${period}`)
  const analysis = useApi<CancellationAnalysis>('/api/analytics/cancellations')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cancellations"
        description="Why orders are being cancelled, at which stage, and by whom."
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
      <Loaded state={analysis} label="cancellation analysis">
        {(a, meta) => (
          <>
            <SourceNote meta={meta}>{a.definition}</SourceNote>
            <div className="grid gap-4 xl:grid-cols-3">
              <Card
                className="xl:col-span-2"
                title="Cancellation reasons"
                description={`Rate ${formatPercent(a.facts.previous)} → ${formatPercent(a.facts.current)} (${formatPointChange(a.facts.pointChange)})`}
              >
                <ComparisonBars data={a.reasons} periods={meta.periods} noun="Cancellations" />
              </Card>
              <Card title="Waiting time and cancellations" description="Hours from order to dispatch, or to cancellation">
                <ul className="divide-y divide-line">
                  {a.byProcessingTime.map((b) => (
                    <li key={b.bucket} className="flex items-center justify-between py-2.5 text-caption">
                      <span className="text-fg-secondary">{b.bucket}</span>
                      <span className="tabular-nums">
                        <span className="font-semibold text-fg">{formatPercent(b.rate)}</span>
                        <span className="ml-2 text-fg-muted">
                          {b.cancelled} of {b.orders}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </>
        )}
      </Loaded>
      <Loaded state={records} label="cancellations">
        {(rows, meta) => (
          <Card title={`${meta.periods[period].label} cancellations`} description={`${rows.length} cancelled orders`}>
            <DataTable
              caption="Cancellations"
              rows={rows}
              columns={COLUMNS}
              rowKey={(r) => r.cancellationId}
              search={{ placeholder: 'Search product, order or reason', text: (r) => `${r.cancellationId} ${r.orderId} ${r.productName} ${r.cancellationReason}` }}
              filters={[
                { id: 'reason', label: 'Reasons', options: unique(rows, (r) => r.cancellationReason), value: (r) => r.cancellationReason },
                { id: 'stage', label: 'Stages', options: unique(rows, (r) => r.cancellationStage), value: (r) => r.cancellationStage },
                { id: 'by', label: 'Initiators', options: unique(rows, (r) => r.cancellationInitiatedBy), value: (r) => r.cancellationInitiatedBy },
              ]}
              initialSort={{ id: 'date', direction: 'desc' }}
              minWidth="64rem"
            />
          </Card>
        )}
      </Loaded>
    </div>
  )
}
