import type { Order, PeriodKey, ReturnRecord } from '@shared/records.ts'
import { useState } from 'react'
import { CHART } from '@/components/charts/theme'
import { SegmentedBar } from '@/components/charts/SegmentedBar'
import { Loaded, SourceNote } from '@/components/data/Loaded'
import { StatTile, Unavailable } from '@/components/data/StatTile'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useApi } from '@/hooks/useApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useSeller } from '@/hooks/useSeller'
import { formatCount, formatCurrency, formatPercent } from '@/lib/format'

function group<T>(rows: T[], key: (r: T) => string, amount: (r: T) => number) {
  const map = new Map<string, { count: number; amount: number }>()
  for (const r of rows) {
    const g = map.get(key(r)) ?? { count: 0, amount: 0 }
    g.count += 1
    g.amount += amount(r)
    map.set(key(r), g)
  }
  return [...map.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.amount - a.amount)
}

const STATUS_COLOR: Record<string, string> = {
  Paid: CHART.current,
  'COD Collected': CHART.brandSoft,
  'COD Pending': CHART.warning,
  'Not Charged': CHART.previousFill,
  'Payment Failed': CHART.negative,
  'Refund Initiated': CHART.serious,
  Refunded: CHART.previous,
}

function Breakdown({ rows }: { rows: Array<{ key: string; count: number; amount: number }> }) {
  return (
    <table className="w-full text-caption">
      <thead>
        <tr className="text-left text-2xs uppercase tracking-[0.08em] text-fg-muted">
          <th className="py-1.5 font-semibold">Status</th>
          <th className="py-1.5 text-right font-semibold">Orders</th>
          <th className="py-1.5 text-right font-semibold">Value</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="py-2 text-fg-secondary">{r.key}</td>
            <td className="py-2 text-right tabular-nums text-fg">{formatCount(r.count)}</td>
            <td className="py-2 text-right font-medium tabular-nums text-fg">{formatCurrency(r.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function PaymentsPage() {
  useDocumentTitle('Payments & Settlements')
  const { periods } = useSeller()
  const [period, setPeriod] = useState<PeriodKey>('current')
  const orders = useApi<Order[]>(`/api/orders?period=${period}`)
  const returns = useApi<ReturnRecord[]>(`/api/returns?period=${period}`)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments & Settlements"
        description="How customers paid for each order, cash on delivery still to collect, and refunds. Settlement data is not part of this demo."
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
      <Loaded state={orders} label="order payments">
        {(rows, meta) => {
          const byStatus = group(rows, (o) => o.paymentStatus, (o) => o.totalAmount)
          const byMethod = group(rows, (o) => o.paymentMethod, (o) => o.totalAmount)
          const pick = (k: string) => byStatus.find((s) => s.key === k) ?? { count: 0, amount: 0 }
          const collected = pick('Paid').amount + pick('COD Collected').amount
          const cod = byMethod.find((m) => m.key === 'COD')
          return (
            <>
              <SourceNote meta={meta}>Payment statuses come from the synthetic order records for {meta.periods[period].label}. Amounts are order values before fees.</SourceNote>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Order value collected" value={formatCurrency(collected)} sub={`${pick('Paid').count + pick('COD Collected').count} orders paid`} />
                <StatTile label="Cash on delivery to collect" value={formatCurrency(pick('COD Pending').amount)} sub={`${pick('COD Pending').count} orders not yet collected`} tone={pick('COD Pending').count ? 'warning' : undefined} />
                <StatTile label="Not charged (cancelled)" value={formatCurrency(pick('Not Charged').amount)} sub={`${pick('Not Charged').count} orders`} />
                <StatTile label="Cash on delivery share" value={cod ? formatPercent(cod.count / rows.length) : '0%'} sub={`${cod?.count ?? 0} of ${rows.length} orders`} />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <Card title="Payment status" description={`${rows.length} orders`}>
                  <SegmentedBar label="Orders by payment status" segments={byStatus.map((s) => ({ label: s.key, value: s.count, color: STATUS_COLOR[s.key] ?? CHART.previous }))} />
                  <div className="mt-4">
                    <Breakdown rows={byStatus} />
                  </div>
                </Card>
                <Loaded state={returns} label="refunds">
                  {(ret) => {
                    const refunds = group(ret, (r) => r.refundStatus, (r) => r.refundAmount)
                    return (
                      <Card title="Refunds" description={`${ret.length} returns in ${meta.periods[period].label}`}>
                        {ret.length === 0 ? (
                          <p className="text-caption text-fg-muted">No returns in this period.</p>
                        ) : (
                          <Breakdown rows={refunds} />
                        )}
                        <h3 className="mt-5 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Payment method</h3>
                        <div className="mt-2">
                          <Breakdown rows={byMethod} />
                        </div>
                      </Card>
                    )
                  }}
                </Loaded>
              </div>
            </>
          )
        }}
      </Loaded>
      <Unavailable
        title="Settlements"
        reason="Settlement, commission and fee data are not part of this demo dataset, so Mini AI cannot show or estimate them."
        items={['Settlement schedule and upcoming payouts', 'Commission and marketplace fees', 'Deductions, penalties and adjustments', 'Order-level reconciliation']}
        question="When is my next settlement due?"
      />
    </div>
  )
}
