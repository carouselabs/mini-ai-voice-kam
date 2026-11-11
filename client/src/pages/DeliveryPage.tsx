import type { DeliveryAnalysis } from '@shared/analytics.ts'
import type { PeriodKey, Shipment } from '@shared/records.ts'
import { MessageCircleQuestion } from 'lucide-react'
import { useState } from 'react'
import { useAssistant } from '@/app/providers/assistant-context'
import { ComparisonBars } from '@/components/charts/ComparisonBars'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { StatTile, Unavailable } from '@/components/data/StatTile'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useApi } from '@/hooks/useApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useSeller } from '@/hooks/useSeller'
import { formatCount, formatDate, formatDecimal, formatPercent, formatPointChange } from '@/lib/format'

const SLA_HOURS = 48
const STATUS_TONE = { Delivered: 'positive', 'Delivered Late': 'warning', 'In Transit': 'brand', 'Cancelled in Transit': 'negative' } as const

const COLUMNS: Column<Shipment>[] = [
  { id: 'id', header: 'Shipment', sortValue: (s) => s.shipmentId, cell: (s) => <span className="font-medium text-fg">{s.shipmentId}</span> },
  { id: 'order', header: 'Order', sortValue: (s) => s.orderId, cell: (s) => <span className="whitespace-nowrap">{s.orderId}</span> },
  { id: 'sku', header: 'SKU', sortValue: (s) => s.sku, cell: (s) => <span className="whitespace-nowrap">{s.sku}</span> },
  {
    id: 'processing',
    header: 'Hours to dispatch',
    align: 'end',
    sortValue: (s) => s.sellerProcessingTime,
    cell: (s) => (
      <span className={s.sellerProcessingTime > SLA_HOURS ? 'font-semibold text-negative' : undefined}>
        {formatDecimal(s.sellerProcessingTime)}
        {s.sellerProcessingTime > SLA_HOURS && <span className="sr-only"> (over {SLA_HOURS} hours)</span>}
      </span>
    ),
  },
  { id: 'dispatch', header: 'Dispatched', sortValue: (s) => s.dispatchDate, cell: (s) => <span className="whitespace-nowrap">{formatDate(s.dispatchDate)}</span> },
  { id: 'promised', header: 'Promised', sortValue: (s) => s.expectedDeliveryDate, cell: (s) => <span className="whitespace-nowrap">{formatDate(s.expectedDeliveryDate)}</span> },
  { id: 'status', header: 'Status', sortValue: (s) => s.deliveryStatus, cell: (s) => <Badge tone={STATUS_TONE[s.deliveryStatus]}>{s.deliveryStatus}</Badge> },
  { id: 'delay', header: 'Days late', align: 'end', sortValue: (s) => s.delayDays, cell: (s) => (s.delayDays ? s.delayDays : '—') },
  { id: 'issue', header: 'Issue', sortValue: (s) => s.deliveryIssue, cell: (s) => (s.deliveryIssue === 'None' ? <span className="text-fg-muted">None</span> : s.deliveryIssue) },
]

const unique = (rows: Shipment[], pick: (s: Shipment) => string) => [...new Set(rows.map(pick))].sort()

export function DeliveryPage() {
  useDocumentTitle('Delivery & Fulfilment')
  const { openAssistant } = useAssistant()
  const { periods } = useSeller()
  const [period, setPeriod] = useState<PeriodKey>('current')
  const analysis = useApi<DeliveryAnalysis>('/api/analytics/delivery')
  const shipments = useApi<Shipment[]>(`/api/shipments?period=${period}`)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivery & Fulfilment"
        description={`Dispatch speed against the ${SLA_HOURS}-hour promise, on-time delivery, late shipments and delivery issues.`}
        actions={
          <Button icon={MessageCircleQuestion} onClick={() => openAssistant('Is there a delivery or dispatch problem?')}>
            Ask about delivery
          </Button>
        }
      />
      <Loaded state={analysis} label="delivery analysis">
        {(d, meta) => (
          <>
            <SourceNote meta={meta}>{d.definition}</SourceNote>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
              <StatTile label="On-time delivery" value={formatPercent(d.onTimeRate.current)} sub={`from ${formatPercent(d.onTimeRate.previous)} (${formatPointChange(d.onTimeRate.pointChange)})`} tone={d.onTimeRate.pointChange < 0 ? 'negative' : 'positive'} />
              <StatTile label="Hours to dispatch (avg)" value={formatDecimal(d.averageProcessingHours.current)} sub={`from ${formatDecimal(d.averageProcessingHours.previous)}`} tone={d.averageProcessingHours.change > 0 ? 'negative' : 'positive'} />
              <StatTile label={`Dispatched after ${SLA_HOURS} h`} value={formatCount(d.dispatchSlaBreaches.current)} sub={`from ${formatCount(d.dispatchSlaBreaches.previous)}`} tone={d.dispatchSlaBreaches.change > 0 ? 'negative' : 'positive'} />
              <StatTile label="Late deliveries" value={formatCount(d.late.current)} sub={`from ${formatCount(d.late.previous)}`} tone={d.late.change > 0 ? 'negative' : 'positive'} />
              <StatTile label="Average days late" value={formatDecimal(d.averageDelayDays.current)} sub={`from ${formatDecimal(d.averageDelayDays.previous)}`} />
              <StatTile label="Shipments" value={formatCount(d.shipments.current)} sub={`from ${formatCount(d.shipments.previous)}`} />
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              <Card title="Where the delay happens" description="Seller processing (order to dispatch) or the courier (dispatch to delivery)">
                <Badge tone={d.bottleneck.stage === 'none' ? 'positive' : 'warning'}>
                  {d.bottleneck.stage === 'seller_processing' ? 'Seller processing' : d.bottleneck.stage === 'logistics' ? 'Courier transit' : 'No clear bottleneck'}
                </Badge>
                <p className="mt-2 text-sm text-fg-secondary">{d.bottleneck.note}</p>
                <dl className="mt-4 space-y-1.5 text-caption">
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-muted">Cancelled for delivery reasons</dt>
                    <dd className="font-medium tabular-nums text-fg">
                      {d.deliveryRelatedCancellations.previous} → {d.deliveryRelatedCancellations.current}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-muted">Cancelled before dispatch</dt>
                    <dd className="font-medium tabular-nums text-fg">
                      {d.cancelledBeforeDispatch.previous} → {d.cancelledBeforeDispatch.current}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-muted">Cancelled after dispatch</dt>
                    <dd className="font-medium tabular-nums text-fg">
                      {d.cancelledAfterDispatch.previous} → {d.cancelledAfterDispatch.current}
                    </dd>
                  </div>
                </dl>
              </Card>
              <Card className="xl:col-span-2" title="Delivery issues" description="Shipments with an issue, by type">
                <ComparisonBars data={d.issues} periods={meta.periods} noun="Shipments" />
              </Card>
            </div>
            <Card title="Slowest to dispatch" description={`Products by average hours from order to dispatch, ${meta.periods.current.label}`}>
              <ul className="divide-y divide-line">
                {d.slowestProducts.map((p) => (
                  <li key={p.productId} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-0.5 py-2.5 text-caption sm:grid-cols-[1fr_7rem_5rem_7rem]">
                    <span className="col-span-2 min-w-0 truncate text-fg-secondary sm:col-span-1">{p.productName}</span>
                    <span className="text-fg-muted sm:text-right">{p.shipments} shipments</span>
                    <span className="text-right font-semibold tabular-nums text-fg">{formatDecimal(p.averageProcessingHours)} h</span>
                    <span className={p.slaBreaches ? 'text-negative sm:text-right' : 'text-fg-muted sm:text-right'}>{p.slaBreaches} over {SLA_HOURS} h</span>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </Loaded>
      <Loaded state={shipments} label="shipments">
        {(rows, meta) => (
          <Card
            title={`${meta.periods[period].label} shipments`}
            description={`${rows.length} shipments`}
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
          >
            <DataTable
              caption="Shipments"
              rows={rows}
              columns={COLUMNS}
              rowKey={(s) => s.shipmentId}
              search={{ placeholder: 'Search shipment, order or SKU', text: (s) => `${s.shipmentId} ${s.orderId} ${s.sku}` }}
              filters={[
                { id: 'status', label: 'Statuses', options: unique(rows, (s) => s.deliveryStatus), value: (s) => s.deliveryStatus },
                { id: 'issue', label: 'Issues', options: unique(rows, (s) => s.deliveryIssue), value: (s) => s.deliveryIssue },
              ]}
              initialSort={{ id: 'processing', direction: 'desc' }}
              minWidth="62rem"
            />
          </Card>
        )}
      </Loaded>
      <Unavailable
        title="Not available in this demo"
        reason="The demo data has shipments and dates, but not these details."
        items={['Delivery time by region or pincode', 'Return-to-origin (RTO) orders', 'Courier partner comparison', 'Live tracking']}
      />
    </div>
  )
}
